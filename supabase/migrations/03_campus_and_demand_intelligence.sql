-- 03_campus_and_demand_intelligence.sql
-- Migration for SRC announcements, Campus Resources, Demand Logs, and Market Demand Intelligence

-- 1. Create campus_events Table for SRC Announcements & Campus Events
CREATE TABLE IF NOT EXISTS public.campus_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    venue TEXT,
    banner_url TEXT,
    campus TEXT NOT NULL DEFAULT 'UG - Legon',
    pinned BOOLEAN DEFAULT false NOT NULL,
    organizer TEXT DEFAULT 'Official SRC',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create campus_resources Table for Lecture Slides, Past Questions & Course Notes
CREATE TABLE IF NOT EXISTS public.campus_resources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    resource_type TEXT NOT NULL DEFAULT 'Past Questions',
    course_code TEXT NOT NULL,
    department TEXT,
    campus TEXT NOT NULL DEFAULT 'UG - Legon',
    file_url TEXT,
    file_name TEXT,
    file_size TEXT,
    downloads INTEGER NOT NULL DEFAULT 0 CHECK (downloads >= 0),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create demand_logs Table for Passive Search Tracking
CREATE TABLE IF NOT EXISTS public.demand_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    search_query TEXT NOT NULL,
    campus TEXT NOT NULL DEFAULT 'General',
    results_count INTEGER NOT NULL DEFAULT 0,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index on demand_logs for performance aggregation
CREATE INDEX IF NOT EXISTS idx_demand_logs_campus_created 
ON public.demand_logs (campus, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demand_logs_query 
ON public.demand_logs (lower(trim(search_query)));

-- 4. Create View campus_market_demand for Vendor Restock Intelligence
CREATE OR REPLACE VIEW public.campus_market_demand AS
SELECT
    lower(trim(search_query)) AS search_query,
    campus,
    COUNT(*)::INTEGER AS search_count,
    MAX(created_at) AS last_searched_at
FROM public.demand_logs
WHERE created_at >= (now() - INTERVAL '7 days')
GROUP BY lower(trim(search_query)), campus
ORDER BY search_count DESC;

-- 5. Storage Bucket setup for campus-docs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'campus-docs',
    'campus-docs',
    true,
    26214400, -- 25MB limit
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/jpeg',
        'image/png',
        'image/webp'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- 6. Enable Row-Level Security
ALTER TABLE public.campus_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_logs ENABLE ROW LEVEL SECURITY;

-- 7. Policies for campus_events
CREATE POLICY "Public campus_events read"
    ON public.campus_events FOR SELECT
    USING (true);

CREATE POLICY "Authenticated campus_events insert"
    ON public.campus_events FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated campus_events update"
    ON public.campus_events FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated campus_events delete"
    ON public.campus_events FOR DELETE
    TO authenticated
    USING (true);

-- 8. Policies for campus_resources
CREATE POLICY "Public campus_resources read"
    ON public.campus_resources FOR SELECT
    USING (true);

CREATE POLICY "Authenticated campus_resources insert"
    ON public.campus_resources FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Public campus_resources download count update"
    ON public.campus_resources FOR UPDATE
    USING (true);

CREATE POLICY "Authenticated campus_resources delete"
    ON public.campus_resources FOR DELETE
    TO authenticated
    USING (true);

-- 9. Policies for demand_logs
CREATE POLICY "Public demand_logs read"
    ON public.demand_logs FOR SELECT
    USING (true);

CREATE POLICY "Public demand_logs insert"
    ON public.demand_logs FOR INSERT
    WITH CHECK (true);

-- 10. Storage policies for campus-docs
CREATE POLICY "Public read campus-docs"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'campus-docs');

CREATE POLICY "Public or Authenticated insert campus-docs"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'campus-docs');

CREATE POLICY "Authenticated update campus-docs"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'campus-docs');

CREATE POLICY "Authenticated delete campus-docs"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'campus-docs');
