-- 05_purchase_methods_and_payments.sql
-- P1: purchase methods (full / credit / installment / reservation), NAFLIS Wallet
-- ledger, payment intents with idempotency, and the order state machine.
--
-- Money is BIGINT minor units (pesewas). Every write to these tables goes
-- through the `payments` Edge Function (service role) calling the
-- SECURITY DEFINER functions below; clients only get SELECT on their own rows.

-- ============================================================================
-- 1. Product purchase configuration & credit profile
-- ============================================================================
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS purchase_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS credit_score INTEGER,
    ADD COLUMN IF NOT EXISTS credit_limit_minor BIGINT;

-- Extend the profile guard from migration 04: credit fields are not self-editable either.
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND coalesce(current_setting('naflis.allow_role_change', true), '') <> 'on'
       AND NOT public.has_role('super_admin') THEN
        new.roles := old.roles;
        new.role := old.role;
        IF NOT (public.has_role('finance') OR public.has_role('admin')) THEN
            new.kyc_verified := old.kyc_verified;
            new.credit_score := old.credit_score;
            new.credit_limit_minor := old.credit_limit_minor;
        END IF;
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 2. Promo codes (validated server-side at checkout)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.promo_codes (
    code TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('percent', 'fixed', 'free-shipping')),
    value NUMERIC(10, 2) NOT NULL,
    min_spend NUMERIC(10, 2),
    max_discount NUMERIC(10, 2),
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public promo_codes read" ON public.promo_codes FOR SELECT USING (active);

INSERT INTO public.promo_codes (code, type, value, min_spend, max_discount, description) VALUES
    ('NAFLIS10',    'percent',       10,  200, 500,  '10% off any order'),
    ('FLASH20',     'percent',       20,  NULL, 800, '20% off flash-sale items'),
    ('FREESHIP',    'free-shipping', 100, NULL, NULL, 'Free delivery on any order'),
    ('BLACKFRIDAY', 'percent',       25,  NULL, 1500, 'Black Friday 25% off'),
    ('FIRSTBUY',    'fixed',         50,  300, NULL, 'GHS 50 off your first order')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 3. Order state machine
-- ============================================================================
-- Mirrors TRANSITIONS in supabase/functions/_shared/orderMachine.ts.
CREATE TABLE IF NOT EXISTS public.order_transitions (
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    actors TEXT[] NOT NULL,
    PRIMARY KEY (from_state, to_state)
);
ALTER TABLE public.order_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public order_transitions read" ON public.order_transitions FOR SELECT USING (true);

INSERT INTO public.order_transitions (from_state, to_state, actors) VALUES
    ('created',          'awaiting_payment', ARRAY['system']),
    ('created',          'cancelled',        ARRAY['system','buyer','admin']),
    ('awaiting_payment', 'paid',             ARRAY['system']),
    ('awaiting_payment', 'cancelled',        ARRAY['system','buyer','admin']),
    ('paid',             'accepted',         ARRAY['seller','admin']),
    ('paid',             'disputed',         ARRAY['buyer','dispute','admin']),
    ('paid',             'refunded',         ARRAY['seller','admin']),
    ('accepted',         'processing',       ARRAY['seller','admin']),
    ('accepted',         'disputed',         ARRAY['buyer','dispute','admin']),
    ('processing',       'ready',            ARRAY['seller','admin']),
    ('processing',       'disputed',         ARRAY['buyer','dispute','admin']),
    ('ready',            'dispatched',       ARRAY['delivery','seller','admin']),
    ('ready',            'disputed',         ARRAY['buyer','dispute','admin']),
    ('dispatched',       'delivered',        ARRAY['delivery','admin']),
    ('dispatched',       'disputed',         ARRAY['buyer','dispute','admin']),
    ('delivered',        'completed',        ARRAY['buyer','system','admin']),
    ('delivered',        'disputed',         ARRAY['buyer','dispute','admin']),
    ('disputed',         'completed',        ARRAY['dispute','admin']),
    ('disputed',         'refunded',         ARRAY['dispute','admin'])
ON CONFLICT (from_state, to_state) DO UPDATE SET actors = EXCLUDED.actors;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'created',
    ADD COLUMN IF NOT EXISTS subtotal_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_fee_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS escrow_fee_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_paid_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS escrow_held_minor BIGINT NOT NULL DEFAULT 0 CHECK (escrow_held_minor >= 0),
    ADD COLUMN IF NOT EXISTS outstanding_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS promo_code TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT,
    ADD COLUMN IF NOT EXISTS delivery_method TEXT,
    ADD COLUMN IF NOT EXISTS delivery_unlocked BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_state_known;
ALTER TABLE public.orders ADD CONSTRAINT orders_state_known CHECK (state IN (
    'created','awaiting_payment','paid','accepted','processing','ready',
    'dispatched','delivered','completed','disputed','cancelled','refunded'
));

-- Backfill from the legacy enum.
UPDATE public.orders SET state = CASE status::TEXT
    WHEN 'pending' THEN 'awaiting_payment'
    WHEN 'paid' THEN 'paid'
    WHEN 'shipped' THEN 'dispatched'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'created' END
WHERE state = 'created';

CREATE UNIQUE INDEX IF NOT EXISTS orders_buyer_idempotency
    ON public.orders (buyer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS unit_price_minor BIGINT,
    ADD COLUMN IF NOT EXISTS purchase_method TEXT NOT NULL DEFAULT 'full'
        CHECK (purchase_method IN ('full','credit','installment','reservation'));

-- Orders are created by the payments service only. The old client-side insert
-- path let a browser record an order as "paid" on its own say-so.
DROP POLICY IF EXISTS "Users can insert their own orders" ON public.orders;

CREATE POLICY "Vendors can view orders containing their items"
    ON public.orders FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.order_items oi JOIN public.vendors v ON v.id = oi.vendor_id
        WHERE oi.order_id = orders.id AND v.user_id = auth.uid()
    ));

CREATE TABLE IF NOT EXISTS public.order_events (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    from_state TEXT,
    to_state TEXT NOT NULL,
    actor_id UUID,
    actor_role TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON public.order_events (order_id, id);
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Order parties read order_events" ON public.order_events FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_id = auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.order_items oi JOIN public.vendors v ON v.id = oi.vendor_id
        WHERE oi.order_id = order_events.order_id AND v.user_id = auth.uid()
    )
);

-- ============================================================================
-- 4. NAFLIS Wallet
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wallet_accounts (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
    escrow_minor BIGINT NOT NULL DEFAULT 0 CHECK (escrow_minor >= 0),
    currency TEXT NOT NULL DEFAULT 'GHS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_intents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('order','installment','reservation_balance','topup')),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    plan_id UUID,
    entry_seq INTEGER,
    reservation_id UUID,
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    currency TEXT NOT NULL DEFAULT 'GHS',
    method TEXT NOT NULL CHECK (method IN ('wallet','card','momo')),
    status TEXT NOT NULL DEFAULT 'requires_payment'
        CHECK (status IN ('requires_payment','processing','succeeded','failed','canceled')),
    provider_reference TEXT UNIQUE,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL CHECK (entry_type IN (
        'topup','payment','escrow_release','refund','settlement','reservation_forfeit','credit_repayment'
    )),
    balance_delta_minor BIGINT NOT NULL,
    escrow_delta_minor BIGINT NOT NULL,
    balance_after_minor BIGINT NOT NULL,
    escrow_after_minor BIGINT NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
    -- One ledger row per business event: retries and webhook replays can't double-post.
    idempotency_key TEXT NOT NULL UNIQUE,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON public.wallet_ledger (user_id, id DESC);

-- ============================================================================
-- 5. Installment / credit plans and reservations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.installment_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    kind TEXT NOT NULL CHECK (kind IN ('installment','credit')),
    principal_minor BIGINT NOT NULL,
    charge_minor BIGINT NOT NULL DEFAULT 0,
    total_minor BIGINT NOT NULL,
    paid_minor BIGINT NOT NULL DEFAULT 0,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly')),
    grace_period_days INTEGER NOT NULL DEFAULT 0,
    late_fee_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
    delivery_rule TEXT NOT NULL CHECK (delivery_rule IN ('on_deposit','after_installments','on_full_payment')),
    deliver_after_installments INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','active','completed','late','defaulted','cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.installment_entries (
    plan_id UUID NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('deposit','installment')),
    due_at TIMESTAMPTZ NOT NULL,
    grace_until TIMESTAMPTZ NOT NULL,
    amount_minor BIGINT NOT NULL,
    paid_minor BIGINT NOT NULL DEFAULT 0,
    paid_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','late','waived')),
    PRIMARY KEY (plan_id, seq)
);

CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    fee_minor BIGINT NOT NULL,
    balance_minor BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    auto_expire BOOLEAN NOT NULL DEFAULT true,
    refund_on_expiry BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','active','converted','expired','cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservations_expiry ON public.reservations (status, expires_at);

-- Read access: owners only. No client write policies on purpose.
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own wallet" ON public.wallet_accounts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Own wallet ledger" ON public.wallet_ledger FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Own payment intents" ON public.payment_intents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Own plans" ON public.installment_plans FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Own plan entries" ON public.installment_entries FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.installment_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
);
CREATE POLICY "Own reservations" ON public.reservations FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Finance reads plans" ON public.installment_plans FOR SELECT
    USING (public.has_role('finance') OR public.has_role('admin'));

-- ============================================================================
-- 6. Core functions (service role only)
-- ============================================================================

-- Posts one wallet movement. Idempotent on p_key; raises insufficient_funds.
CREATE OR REPLACE FUNCTION public.naflis_wallet_post(
    p_user UUID, p_type TEXT, p_balance_delta BIGINT, p_escrow_delta BIGINT,
    p_order UUID, p_intent UUID, p_key TEXT, p_note TEXT
) RETURNS VOID AS $$
DECLARE
    v_balance BIGINT;
    v_escrow BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM public.wallet_ledger WHERE idempotency_key = p_key) THEN
        RETURN;
    END IF;
    INSERT INTO public.wallet_accounts (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
    SELECT balance_minor, escrow_minor INTO v_balance, v_escrow
    FROM public.wallet_accounts WHERE user_id = p_user FOR UPDATE;

    IF v_balance + p_balance_delta < 0 THEN
        RAISE EXCEPTION 'insufficient_funds' USING ERRCODE = 'P0001';
    END IF;
    IF v_escrow + p_escrow_delta < 0 THEN
        RAISE EXCEPTION 'escrow_underflow' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.wallet_accounts
    SET balance_minor = v_balance + p_balance_delta,
        escrow_minor = v_escrow + p_escrow_delta,
        updated_at = now()
    WHERE user_id = p_user;

    INSERT INTO public.wallet_ledger (
        user_id, entry_type, balance_delta_minor, escrow_delta_minor,
        balance_after_minor, escrow_after_minor, order_id, intent_id, idempotency_key, note
    ) VALUES (
        p_user, p_type, p_balance_delta, p_escrow_delta,
        v_balance + p_balance_delta, v_escrow + p_escrow_delta, p_order, p_intent, p_key, p_note
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recomputes whether an order may be dispatched under its plans' delivery rules.
CREATE OR REPLACE FUNCTION public.naflis_refresh_delivery_gate(p_order UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_ok BOOLEAN;
BEGIN
    SELECT
        NOT EXISTS (
            SELECT 1 FROM public.reservations r
            WHERE r.order_id = p_order AND r.status IN ('pending', 'active')
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.installment_plans p
            WHERE p.order_id = p_order AND NOT (
                p.delivery_rule = 'on_deposit'
                OR (p.delivery_rule = 'after_installments'
                    AND EXISTS (SELECT 1 FROM public.installment_entries e WHERE e.plan_id = p.id AND e.seq = 0 AND e.status = 'paid')
                    AND (SELECT count(*) FROM public.installment_entries e WHERE e.plan_id = p.id AND e.seq > 0 AND e.status = 'paid')
                        >= p.deliver_after_installments)
                OR (p.delivery_rule = 'on_full_payment'
                    AND NOT EXISTS (SELECT 1 FROM public.installment_entries e WHERE e.plan_id = p.id AND e.status <> 'paid'))
            )
        )
    INTO v_ok;
    UPDATE public.orders SET delivery_unlocked = v_ok, updated_at = now() WHERE id = p_order;
    RETURN v_ok;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Releases buyer escrow and credits each seller their item value minus their share of the escrow fee.
CREATE OR REPLACE FUNCTION public.naflis_release_escrow(p_order UUID)
RETURNS VOID AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_seller RECORD;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order FOR UPDATE;
    IF v_order.escrow_held_minor > 0 THEN
        PERFORM public.naflis_wallet_post(v_order.buyer_id, 'escrow_release', 0, -v_order.escrow_held_minor,
            p_order, NULL, 'release:' || p_order, 'Escrow released on completion');
    END IF;
    FOR v_seller IN
        SELECT v.user_id, sum(oi.unit_price_minor * oi.quantity) AS gross
        FROM public.order_items oi JOIN public.vendors v ON v.id = oi.vendor_id
        WHERE oi.order_id = p_order
        GROUP BY v.user_id
    LOOP
        PERFORM public.naflis_wallet_post(
            v_seller.user_id, 'settlement',
            v_seller.gross - CASE WHEN v_order.subtotal_minor > 0
                THEN round(v_order.escrow_fee_minor::NUMERIC * v_seller.gross / v_order.subtotal_minor)::BIGINT ELSE 0 END,
            0, p_order, NULL, 'settle:' || p_order || ':' || v_seller.user_id, 'Order settlement');
    END LOOP;
    UPDATE public.orders SET escrow_held_minor = 0 WHERE id = p_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Returns held escrow to the buyer's wallet balance.
CREATE OR REPLACE FUNCTION public.naflis_refund_escrow(p_order UUID)
RETURNS VOID AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order FOR UPDATE;
    IF v_order.escrow_held_minor > 0 THEN
        PERFORM public.naflis_wallet_post(v_order.buyer_id, 'refund', v_order.escrow_held_minor, -v_order.escrow_held_minor,
            p_order, NULL, 'refund:' || p_order, 'Order refunded to wallet');
        UPDATE public.orders SET escrow_held_minor = 0 WHERE id = p_order;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Returns stock taken by an order that will never be fulfilled.
CREATE OR REPLACE FUNCTION public.naflis_restock(p_order UUID)
RETURNS VOID AS $$
    UPDATE public.products p SET stock = p.stock + oi.quantity
    FROM public.order_items oi WHERE oi.order_id = p_order AND oi.product_id = p.id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- The only way an order changes state.
CREATE OR REPLACE FUNCTION public.naflis_transition_order(
    p_order UUID, p_to TEXT, p_actor_role TEXT, p_actor UUID, p_note TEXT
) RETURNS TEXT AS $$
DECLARE
    v_from TEXT;
    v_unlocked BOOLEAN;
BEGIN
    SELECT state, delivery_unlocked INTO v_from, v_unlocked FROM public.orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.order_transitions
        WHERE from_state = v_from AND to_state = p_to AND p_actor_role = ANY (actors)
    ) THEN
        RAISE EXCEPTION 'invalid_transition:% -> % as %', v_from, p_to, p_actor_role USING ERRCODE = 'P0001';
    END IF;
    IF p_to = 'dispatched' AND NOT v_unlocked THEN
        RAISE EXCEPTION 'delivery_locked' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.orders SET
        state = p_to,
        status = (CASE
            WHEN p_to IN ('created','awaiting_payment') THEN 'pending'
            WHEN p_to IN ('paid','accepted','processing','ready','disputed') THEN 'paid'
            WHEN p_to = 'dispatched' THEN 'shipped'
            WHEN p_to IN ('delivered','completed') THEN 'delivered'
            ELSE 'cancelled' END)::public.order_status,
        updated_at = now()
    WHERE id = p_order;

    INSERT INTO public.order_events (order_id, from_state, to_state, actor_id, actor_role, note)
    VALUES (p_order, v_from, p_to, p_actor, p_actor_role, p_note);

    IF p_to = 'completed' THEN
        PERFORM public.naflis_release_escrow(p_order);
    ELSIF p_to = 'refunded' THEN
        PERFORM public.naflis_refund_escrow(p_order);
        PERFORM public.naflis_restock(p_order);
    ELSIF p_to = 'cancelled' THEN
        PERFORM public.naflis_refund_escrow(p_order);
        PERFORM public.naflis_restock(p_order);
        UPDATE public.installment_plans SET status = 'cancelled' WHERE order_id = p_order AND status IN ('pending','active');
    END IF;
    RETURN p_to;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Creates order + items + plans + reservation + payment intent atomically from a
-- server-computed quote (see quoteCheckout in _shared/purchase.ts). Idempotent on (user, key).
CREATE OR REPLACE FUNCTION public.naflis_create_checkout(
    p_user UUID, p_key TEXT, p_request_hash TEXT, p_quote JSONB,
    p_method TEXT, p_address TEXT, p_delivery_method TEXT
) RETURNS UUID AS $$
DECLARE
    v_existing public.payment_intents%ROWTYPE;
    v_order UUID;
    v_intent UUID;
    v_line JSONB;
    v_entry JSONB;
    v_plan UUID;
    v_vendor UUID;
    v_rows INTEGER;
    v_due BIGINT := (p_quote->>'dueNowMinor')::BIGINT;
    v_later BIGINT := (p_quote->>'laterMinor')::BIGINT;
BEGIN
    SELECT * INTO v_existing FROM public.payment_intents WHERE user_id = p_user AND idempotency_key = p_key;
    IF FOUND THEN
        IF v_existing.request_hash <> p_request_hash THEN
            RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'P0001';
        END IF;
        RETURN v_existing.id;
    END IF;

    INSERT INTO public.orders (
        buyer_id, total_amount, status, state, subtotal_minor, discount_minor, delivery_fee_minor,
        escrow_fee_minor, total_minor, outstanding_minor, promo_code, address, payment_method,
        delivery_method, idempotency_key
    ) VALUES (
        p_user, (v_due + v_later) / 100.0, 'pending', 'created',
        (p_quote->>'subtotalMinor')::BIGINT, (p_quote->>'discountMinor')::BIGINT, (p_quote->>'deliveryMinor')::BIGINT,
        (p_quote->>'escrowFeeMinor')::BIGINT, v_due + v_later, v_later, p_quote->>'promoCode', p_address, p_method,
        p_delivery_method, p_key
    ) RETURNING id INTO v_order;

    INSERT INTO public.order_events (order_id, from_state, to_state, actor_id, actor_role, note)
    VALUES (v_order, NULL, 'created', p_user, 'system', 'Order created');

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_quote->'lines') LOOP
        SELECT vendor_id INTO v_vendor FROM public.products WHERE id = (v_line->>'productId')::UUID;

        -- Take stock now; it comes back if the order is cancelled or a reservation expires.
        UPDATE public.products SET stock = stock - (v_line->>'qty')::INTEGER
        WHERE id = (v_line->>'productId')::UUID AND stock >= (v_line->>'qty')::INTEGER;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
            RAISE EXCEPTION 'out_of_stock:%', v_line->>'productId' USING ERRCODE = 'P0001';
        END IF;

        INSERT INTO public.order_items (order_id, product_id, vendor_id, quantity, price, unit_price_minor, purchase_method)
        VALUES (
            v_order, (v_line->>'productId')::UUID, v_vendor, (v_line->>'qty')::INTEGER,
            ((v_line->>'lineTotalMinor')::BIGINT / (v_line->>'qty')::INTEGER) / 100.0,
            (v_line->>'lineTotalMinor')::BIGINT / (v_line->>'qty')::INTEGER,
            v_line->>'method'
        );

        IF v_line ? 'plan' THEN
            INSERT INTO public.installment_plans (
                order_id, user_id, product_id, kind, principal_minor, charge_minor, total_minor,
                frequency, grace_period_days, late_fee_pct, delivery_rule, deliver_after_installments
            ) VALUES (
                v_order, p_user, (v_line->>'productId')::UUID, v_line->'plan'->>'kind',
                (v_line->'plan'->>'principalMinor')::BIGINT, (v_line->'plan'->>'chargeMinor')::BIGINT,
                (v_line->'plan'->>'totalMinor')::BIGINT, v_line->'plan'->>'frequency',
                (v_line->'plan'->>'gracePeriodDays')::INTEGER, (v_line->'plan'->>'lateFeePct')::NUMERIC,
                v_line->'plan'->>'deliveryRule', (v_line->'plan'->>'deliverAfterInstallments')::INTEGER
            ) RETURNING id INTO v_plan;

            FOR v_entry IN SELECT * FROM jsonb_array_elements(v_line->'plan'->'entries') LOOP
                INSERT INTO public.installment_entries (plan_id, seq, kind, due_at, grace_until, amount_minor)
                VALUES (
                    v_plan, (v_entry->>'seq')::INTEGER, v_entry->>'kind',
                    to_timestamp((v_entry->>'dueAt')::BIGINT / 1000.0),
                    to_timestamp((v_entry->>'graceUntil')::BIGINT / 1000.0),
                    (v_entry->>'amountMinor')::BIGINT
                );
            END LOOP;
        END IF;

        IF v_line ? 'reservation' THEN
            INSERT INTO public.reservations (
                order_id, user_id, product_id, quantity, fee_minor, balance_minor, expires_at, auto_expire, refund_on_expiry
            ) VALUES (
                v_order, p_user, (v_line->>'productId')::UUID, (v_line->>'qty')::INTEGER,
                (v_line->'reservation'->>'feeMinor')::BIGINT, v_later,
                to_timestamp((v_line->'reservation'->>'expiresAt')::BIGINT / 1000.0),
                (v_line->'reservation'->>'autoExpire')::BOOLEAN, (v_line->'reservation'->>'refundOnExpiry')::BOOLEAN
            );
        END IF;
    END LOOP;

    PERFORM public.naflis_refresh_delivery_gate(v_order);
    PERFORM public.naflis_transition_order(v_order, 'awaiting_payment', 'system', p_user, 'Payment intent created');

    v_intent := gen_random_uuid();
    INSERT INTO public.payment_intents (
        id, user_id, idempotency_key, request_hash, purpose, order_id, amount_minor, method, provider_reference
    ) VALUES (
        v_intent, p_user, p_key, p_request_hash, 'order', v_order, v_due, p_method,
        CASE WHEN p_method IN ('card','momo') THEN 'nfl_' || replace(v_intent::TEXT, '-', '') END
    );

    -- Nothing to collect (e.g. a credit sale with no fees): settle immediately.
    IF v_due = 0 THEN
        PERFORM public.naflis_mark_intent_succeeded(v_intent, NULL);
    END IF;
    RETURN v_intent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Applies a confirmed payment. Idempotent; p_provider_amount (minor units) is
-- checked against the intent when the money came from Paystack.
CREATE OR REPLACE FUNCTION public.naflis_mark_intent_succeeded(p_intent UUID, p_provider_amount BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
    v_i public.payment_intents%ROWTYPE;
    v_plan public.installment_plans%ROWTYPE;
    v_escrow BOOLEAN;
    v_has_reservation BOOLEAN;
BEGIN
    SELECT * INTO v_i FROM public.payment_intents WHERE id = p_intent FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'intent_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_i.status = 'succeeded' THEN
        RETURN true;
    END IF;
    IF p_provider_amount IS NOT NULL AND p_provider_amount <> v_i.amount_minor THEN
        UPDATE public.payment_intents SET status = 'failed', failure_reason = 'amount_mismatch', updated_at = now() WHERE id = p_intent;
        RETURN false;
    END IF;

    IF v_i.purpose = 'installment' THEN
        SELECT * INTO v_plan FROM public.installment_plans WHERE id = v_i.plan_id FOR UPDATE;
    END IF;
    -- Credit repayments go to NAFLIS, everything else is held in the buyer's escrow.
    v_escrow := v_i.purpose IN ('order', 'reservation_balance') OR (v_i.purpose = 'installment' AND v_plan.kind = 'installment');

    IF v_i.amount_minor > 0 THEN
        IF v_i.purpose = 'topup' THEN
            PERFORM public.naflis_wallet_post(v_i.user_id, 'topup', v_i.amount_minor, 0, NULL, v_i.id, 'intent:' || v_i.id, 'Wallet top-up');
        ELSE
            PERFORM public.naflis_wallet_post(
                v_i.user_id,
                CASE WHEN v_escrow THEN 'payment' ELSE 'credit_repayment' END,
                CASE WHEN v_i.method = 'wallet' THEN -v_i.amount_minor ELSE 0 END,
                CASE WHEN v_escrow THEN v_i.amount_minor ELSE 0 END,
                v_i.order_id, v_i.id, 'intent:' || v_i.id,
                CASE WHEN v_i.method = 'wallet' THEN 'Paid from NAFLIS Wallet' ELSE 'Paid by ' || v_i.method END
            );
        END IF;
    END IF;

    UPDATE public.payment_intents SET status = 'succeeded', confirmed_at = now(), updated_at = now(), failure_reason = NULL
    WHERE id = p_intent;

    IF v_i.purpose = 'order' THEN
        UPDATE public.orders SET
            amount_paid_minor = amount_paid_minor + v_i.amount_minor,
            escrow_held_minor = escrow_held_minor + v_i.amount_minor
        WHERE id = v_i.order_id;
        UPDATE public.installment_entries e SET status = 'paid', paid_minor = e.amount_minor, paid_at = now()
        FROM public.installment_plans p
        WHERE p.order_id = v_i.order_id AND e.plan_id = p.id AND e.seq = 0;
        UPDATE public.installment_plans SET status = 'active',
            paid_minor = (SELECT coalesce(sum(paid_minor), 0) FROM public.installment_entries WHERE plan_id = installment_plans.id)
        WHERE order_id = v_i.order_id;
        UPDATE public.reservations SET status = 'active' WHERE order_id = v_i.order_id AND status = 'pending';
        SELECT EXISTS (SELECT 1 FROM public.reservations WHERE order_id = v_i.order_id AND status = 'active') INTO v_has_reservation;
        PERFORM public.naflis_refresh_delivery_gate(v_i.order_id);
        IF NOT v_has_reservation THEN
            PERFORM public.naflis_transition_order(v_i.order_id, 'paid', 'system', NULL, 'Payment confirmed — funds in escrow');
        ELSE
            INSERT INTO public.order_events (order_id, from_state, to_state, actor_role, note)
            VALUES (v_i.order_id, 'awaiting_payment', 'awaiting_payment', 'system', 'Reservation fee paid — stock held');
        END IF;

    ELSIF v_i.purpose = 'installment' THEN
        UPDATE public.installment_entries SET status = 'paid', paid_minor = amount_minor, paid_at = now()
        WHERE plan_id = v_i.plan_id AND seq = v_i.entry_seq;
        UPDATE public.installment_plans SET
            paid_minor = paid_minor + v_i.amount_minor,
            status = CASE
                WHEN NOT EXISTS (SELECT 1 FROM public.installment_entries WHERE plan_id = v_i.plan_id AND status <> 'paid') THEN 'completed'
                WHEN EXISTS (SELECT 1 FROM public.installment_entries WHERE plan_id = v_i.plan_id AND status = 'late') THEN 'late'
                ELSE 'active' END
        WHERE id = v_i.plan_id;
        UPDATE public.orders SET
            amount_paid_minor = amount_paid_minor + v_i.amount_minor,
            escrow_held_minor = escrow_held_minor + CASE WHEN v_escrow THEN v_i.amount_minor ELSE 0 END,
            outstanding_minor = greatest(0, outstanding_minor - v_i.amount_minor)
        WHERE id = v_i.order_id;
        PERFORM public.naflis_refresh_delivery_gate(v_i.order_id);

    ELSIF v_i.purpose = 'reservation_balance' THEN
        UPDATE public.reservations SET status = 'converted', balance_minor = 0 WHERE id = v_i.reservation_id;
        UPDATE public.orders SET
            amount_paid_minor = amount_paid_minor + v_i.amount_minor,
            escrow_held_minor = escrow_held_minor + v_i.amount_minor,
            outstanding_minor = greatest(0, outstanding_minor - v_i.amount_minor)
        WHERE id = v_i.order_id;
        PERFORM public.naflis_refresh_delivery_gate(v_i.order_id);
        PERFORM public.naflis_transition_order(v_i.order_id, 'paid', 'system', NULL, 'Reservation balance paid — funds in escrow');
    END IF;
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Wallet payments: checks the balance under lock, then settles.
CREATE OR REPLACE FUNCTION public.naflis_pay_intent_with_wallet(p_intent UUID)
RETURNS TEXT AS $$
DECLARE
    v_i public.payment_intents%ROWTYPE;
    v_balance BIGINT;
BEGIN
    SELECT * INTO v_i FROM public.payment_intents WHERE id = p_intent FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'intent_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_i.status IN ('succeeded', 'failed', 'canceled') OR v_i.method <> 'wallet' THEN
        RETURN v_i.status;
    END IF;
    INSERT INTO public.wallet_accounts (user_id) VALUES (v_i.user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT balance_minor INTO v_balance FROM public.wallet_accounts WHERE user_id = v_i.user_id FOR UPDATE;
    IF v_balance < v_i.amount_minor THEN
        UPDATE public.payment_intents SET status = 'failed', failure_reason = 'insufficient_funds', updated_at = now() WHERE id = p_intent;
        -- A failed checkout releases its stock now; the buyer retries with a fresh checkout.
        -- (Installment / reservation intents are reset and retried by the payments function instead.)
        IF v_i.purpose = 'order' THEN
            PERFORM public.naflis_transition_order(v_i.order_id, 'cancelled', 'system', NULL, 'Wallet balance too low — checkout cancelled');
        END IF;
        RETURN 'failed';
    END IF;
    PERFORM public.naflis_mark_intent_succeeded(p_intent, NULL);
    RETURN 'succeeded';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 7. Scheduled jobs
-- ============================================================================

-- Releases expired reservations: stock back, order cancelled, fee refunded or forfeited.
CREATE OR REPLACE FUNCTION public.naflis_expire_reservations()
RETURNS INTEGER AS $$
DECLARE
    v_r public.reservations%ROWTYPE;
    v_n INTEGER := 0;
BEGIN
    FOR v_r IN
        SELECT * FROM public.reservations
        WHERE status = 'active' AND auto_expire AND expires_at < now()
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.reservations SET status = 'expired' WHERE id = v_r.id;
        IF NOT v_r.refund_on_expiry THEN
            -- Forfeit: the fee leaves escrow without returning to the balance.
            PERFORM public.naflis_wallet_post(v_r.user_id, 'reservation_forfeit', 0, -v_r.fee_minor,
                v_r.order_id, NULL, 'forfeit:' || v_r.id, 'Reservation expired — fee forfeited');
            UPDATE public.orders SET escrow_held_minor = greatest(0, escrow_held_minor - v_r.fee_minor) WHERE id = v_r.order_id;
        END IF;
        -- cancelled → refunds whatever escrow remains (the fee, if refundable) and restocks.
        PERFORM public.naflis_transition_order(v_r.order_id, 'cancelled', 'system', NULL, 'Reservation expired — stock released');
        v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Flags installments past their grace period.
CREATE OR REPLACE FUNCTION public.naflis_mark_late_installments()
RETURNS INTEGER AS $$
DECLARE
    v_n INTEGER;
BEGIN
    UPDATE public.installment_entries SET status = 'late'
    WHERE status = 'pending' AND grace_until < now();
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE public.installment_plans p SET status = 'late'
    WHERE p.status = 'active' AND EXISTS (SELECT 1 FROM public.installment_entries e WHERE e.plan_id = p.id AND e.status = 'late');
    RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Cancels checkouts abandoned before payment (restocks via the cancelled transition).
CREATE OR REPLACE FUNCTION public.naflis_expire_stale_checkouts()
RETURNS INTEGER AS $$
DECLARE
    v_i RECORD;
    v_n INTEGER := 0;
BEGIN
    FOR v_i IN
        SELECT pi.id, pi.order_id FROM public.payment_intents pi
        JOIN public.orders o ON o.id = pi.order_id
        WHERE pi.purpose = 'order' AND pi.status IN ('requires_payment', 'failed')
          AND pi.created_at < now() - INTERVAL '30 minutes' AND o.state = 'awaiting_payment'
        FOR UPDATE OF pi SKIP LOCKED
    LOOP
        UPDATE public.payment_intents SET status = 'canceled', failure_reason = 'expired', updated_at = now() WHERE id = v_i.id;
        PERFORM public.naflis_transition_order(v_i.order_id, 'cancelled', 'system', NULL, 'Payment not completed in time');
        v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Lock every money-moving function down to the service role.
DO $$
DECLARE
    f TEXT;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'naflis_wallet_post(uuid,text,bigint,bigint,uuid,uuid,text,text)',
        'naflis_refresh_delivery_gate(uuid)',
        'naflis_release_escrow(uuid)',
        'naflis_refund_escrow(uuid)',
        'naflis_restock(uuid)',
        'naflis_transition_order(uuid,text,text,uuid,text)',
        'naflis_create_checkout(uuid,text,text,jsonb,text,text,text)',
        'naflis_mark_intent_succeeded(uuid,bigint)',
        'naflis_pay_intent_with_wallet(uuid)',
        'naflis_expire_reservations()',
        'naflis_mark_late_installments()',
        'naflis_expire_stale_checkouts()'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
    END LOOP;
END $$;

-- Schedule the jobs when pg_cron is available (Dashboard → Database → Extensions).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('naflis-expire-reservations', '*/5 * * * *', 'SELECT public.naflis_expire_reservations()');
        PERFORM cron.schedule('naflis-late-installments', '15 * * * *', 'SELECT public.naflis_mark_late_installments()');
        PERFORM cron.schedule('naflis-stale-checkouts', '*/10 * * * *', 'SELECT public.naflis_expire_stale_checkouts()');
    END IF;
END $$;
