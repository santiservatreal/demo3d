CREATE TABLE vault.pseudonym_mappings (
 organization_id text NOT NULL REFERENCES organizations(id),scope_id text NOT NULL,owner_id text NOT NULL,
 canonical_key text NOT NULL,token text NOT NULL,ciphertext text NOT NULL,key_version text NOT NULL,
 expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,
 PRIMARY KEY(organization_id,scope_id,canonical_key),UNIQUE(organization_id,scope_id,token)
);
REVOKE ALL ON vault.pseudonym_mappings FROM PUBLIC,birdview_runtime,birdview_auth,birdview_vault;
GRANT USAGE ON SCHEMA vault TO birdview_vault;
CREATE FUNCTION vault.put_mapping(p_scope text,p_key text,p_token text,p_cipher text,p_expires timestamptz,p_version text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,vault,birdview_private AS $$
BEGIN
 IF NOT birdview_private.context_is_valid() OR length(p_cipher)>100000 OR p_expires<=now() OR p_expires>now()+interval '7 days' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO vault.pseudonym_mappings VALUES(current_setting('app.organization_id'),p_scope,current_setting('app.user_id'),p_key,p_token,p_cipher,p_version,p_expires,false)
 ON CONFLICT(organization_id,scope_id,canonical_key) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,expires_at=EXCLUDED.expires_at,key_version=EXCLUDED.key_version
 WHERE vault.pseudonym_mappings.owner_id=current_setting('app.user_id') AND NOT vault.pseudonym_mappings.revoked;
END $$;
CREATE FUNCTION vault.find_mappings(p_scope text,p_key text,p_tokens text[]) RETURNS SETOF vault.pseudonym_mappings
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,vault,birdview_private AS $$
 SELECT * FROM vault.pseudonym_mappings WHERE birdview_private.context_is_valid() AND organization_id=current_setting('app.organization_id') AND owner_id=current_setting('app.user_id') AND scope_id=p_scope AND NOT revoked AND expires_at>now() AND ((p_key IS NOT NULL AND canonical_key=p_key) OR (cardinality(p_tokens)<=200 AND token=ANY(p_tokens))) LIMIT 200;
$$;
CREATE FUNCTION vault.revoke_scope(p_scope text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,vault,birdview_private AS $$
 UPDATE vault.pseudonym_mappings SET revoked=true WHERE birdview_private.context_is_valid() AND organization_id=current_setting('app.organization_id') AND owner_id=current_setting('app.user_id') AND scope_id=p_scope;
$$;
CREATE FUNCTION vault.purge_expired() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,vault AS $$
DECLARE n integer; BEGIN DELETE FROM vault.pseudonym_mappings WHERE (organization_id,scope_id,canonical_key) IN(SELECT organization_id,scope_id,canonical_key FROM vault.pseudonym_mappings WHERE expires_at<now() OR revoked LIMIT 1000);GET DIAGNOSTICS n=ROW_COUNT;RETURN n;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vault FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA vault TO birdview_vault;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.departments,public.roles,public.permissions,public.bindings TO birdview_auth;
CREATE POLICY directory_departments ON public.departments FOR ALL TO birdview_auth
USING (organization_id=nullif(current_setting('app.organization_id',true),'') AND birdview_private.context_is_valid())
WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'') AND birdview_private.context_is_valid());
CREATE TABLE birdview_private.invitations(id text PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),email text NOT NULL,role text NOT NULL,department_ids text[] NOT NULL,token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,used_at timestamptz);
GRANT SELECT,INSERT,UPDATE,DELETE ON birdview_private.invitations TO birdview_auth;
CREATE FUNCTION birdview_private.sync_api_principal(p_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,birdview_private AS $$
DECLARE r public.api_keys; BEGIN
 IF NOT birdview_private.context_is_valid() OR NOT EXISTS(SELECT 1 FROM memberships WHERE organization_id=current_setting('app.organization_id') AND user_id=current_setting('app.user_id') AND active AND role IN('owner','admin')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.api_keys WHERE organization_id=current_setting('app.organization_id') AND id=p_id;
 IF NOT FOUND THEN UPDATE birdview_private.api_principals SET active=false WHERE organization_id=current_setting('app.organization_id') AND id=p_id;RETURN; END IF;
 INSERT INTO birdview_private.api_principals(id,organization_id,owner_id,key_hash,permissions,department_ids,active,expires_at)
 VALUES(r.id,r.organization_id,current_setting('app.user_id'),coalesce(r.data->>'keyHash',r.data->>'hash'),ARRAY(SELECT jsonb_array_elements_text(r.data->'permissions')),ARRAY(SELECT jsonb_array_elements_text(r.data->'departmentIds')),coalesce((r.data->>'active')::boolean,true) AND coalesce(r.data->>'status','active')<>'revoked',nullif(r.data->>'expiresAt','')::timestamptz)
 ON CONFLICT(id) DO UPDATE SET active=EXCLUDED.active,permissions=EXCLUDED.permissions,department_ids=EXCLUDED.department_ids,expires_at=EXCLUDED.expires_at;
END $$;
REVOKE ALL ON FUNCTION birdview_private.sync_api_principal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION birdview_private.sync_api_principal(text) TO birdview_runtime;
