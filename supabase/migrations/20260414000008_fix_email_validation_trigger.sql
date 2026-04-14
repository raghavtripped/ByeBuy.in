-- Fix B-4 / L-3: The trigger before_user_insert_validate_email was pointing to
-- validate_user_email_domain() (no Gmail whitelist) instead of
-- validate_new_user_email() (has the Gmail whitelist for dev accounts).
-- validate_user_email_domain() is dead code. This migration switches the trigger
-- to the correct function and cleans up the dead function.

-- Ensure the function with the whitelist exists (idempotent)
CREATE OR REPLACE FUNCTION public.validate_new_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Developer whitelist
    IF NEW.email IN (
        'raghavtripathi2408@gmail.com',
        'raghavtripathi2203@gmail.com'
    ) THEN
        RETURN NEW;
    END IF;

    -- Domain check: only IIM Indore institutional emails
    IF NEW.email !~* '@iimidr\.ac\.in$' THEN
        RAISE EXCEPTION 'Signup blocked: Only @iimidr.ac.in email addresses are allowed. Your email: %', NEW.email
        USING HINT = 'Please use your IIM Indore institutional email address or contact admin if you believe this is an error.';
    END IF;

    RETURN NEW;
END;
$$;

-- Re-point the trigger to the correct function
DROP TRIGGER IF EXISTS before_user_insert_validate_email ON auth.users;
CREATE TRIGGER before_user_insert_validate_email
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.validate_new_user_email();

-- Drop the dead function that the trigger was incorrectly pointing to
DROP FUNCTION IF EXISTS public.validate_user_email_domain();
