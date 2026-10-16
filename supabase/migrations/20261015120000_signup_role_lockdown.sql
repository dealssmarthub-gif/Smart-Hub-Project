-- 20261015120000_signup_role_lockdown.sql
-- Sign-up metadata is written by the browser, so it must never grant a role.
-- Before this, signUp({ data: { role: 'admin' } }) produced a real admin.
-- Staff roles now come only from naflis_accept_staff_invite, the vendor trigger
-- (seller), or a super admin.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone, role, roles)
    VALUES (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
        coalesce(new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'phone_number', new.phone, ''),
        'buyer'::public.user_role,
        ARRAY['buyer']::TEXT[]
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Same as migration 06, plus: email is not self-editable. profiles.email is
-- UNIQUE, so a user could otherwise claim someone else's address and make
-- that person's sign-up fail.
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND coalesce(current_setting('naflis.allow_role_change', true), '') <> 'on'
       AND NOT public.has_role('super_admin') THEN
        new.roles := old.roles;
        new.role := old.role;
        new.email := old.email;
        IF NOT (public.has_role('finance') OR public.has_role('admin')) THEN
            new.kyc_verified := old.kyc_verified;
            new.credit_score := old.credit_score;
            new.credit_limit_minor := old.credit_limit_minor;
        END IF;
        IF NOT (public.has_role('src_head') OR public.has_role('admin')) THEN
            new.institution_id := old.institution_id;
        END IF;
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
