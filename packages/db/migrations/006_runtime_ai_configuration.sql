-- A bounded server-side lookup. Ordinary members never gain list access to provider credentials.
CREATE FUNCTION birdview_private.runtime_ai_configuration() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,birdview_private AS $$
 SELECT jsonb_build_object('provider',(
 SELECT jsonb_build_object('id',p.id,'data',p.data) FROM public.ai_provider_configs p WHERE p.organization_id=current_setting('app.organization_id',true) AND p.data->>'status'='active' AND p.data#>>'{review,status}'='approved' ORDER BY p.updated_at DESC LIMIT 1
 ),'privacy',(
 SELECT jsonb_build_object('smallGroupThreshold',coalesce(p.data->'smallGroupThreshold','5'::jsonb)) FROM public.privacy_policies p WHERE p.organization_id=current_setting('app.organization_id',true) ORDER BY p.updated_at DESC LIMIT 1
 )) WHERE birdview_private.context_is_valid() AND current_setting('app.principal_type',true)='user';
$$;
REVOKE ALL ON FUNCTION birdview_private.runtime_ai_configuration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION birdview_private.runtime_ai_configuration() TO birdview_runtime;
