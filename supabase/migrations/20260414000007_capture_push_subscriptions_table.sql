-- Schema drift fix: push_subscriptions exists in live DB but not in any migration.
-- Using IF NOT EXISTS so this is safe to run against the live DB (which already has it).

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_details JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.push_subscriptions IS
    'Stores user push notification subscription details. One row per user (latest device).';

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies (CREATE IF NOT EXISTS not supported for policies; use DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'push_subscriptions' AND policyname = 'Users can view their own subscriptions.'
    ) THEN
        CREATE POLICY "Users can view their own subscriptions."
            ON public.push_subscriptions FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'push_subscriptions' AND policyname = 'Users can insert their own subscriptions.'
    ) THEN
        CREATE POLICY "Users can insert their own subscriptions."
            ON public.push_subscriptions FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'push_subscriptions' AND policyname = 'Users can update their own subscriptions.'
    ) THEN
        CREATE POLICY "Users can update their own subscriptions."
            ON public.push_subscriptions FOR UPDATE
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'push_subscriptions' AND policyname = 'Users can delete their own subscriptions.'
    ) THEN
        CREATE POLICY "Users can delete their own subscriptions."
            ON public.push_subscriptions FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
