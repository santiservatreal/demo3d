-- Technical service roles remain subject to tenant RLS. No unrestricted business reader is granted.
GRANT SELECT,INSERT,UPDATE,DELETE ON public.encrypted_credentials TO birdview_runtime;
ALTER TABLE birdview_private.api_principals ADD COLUMN queries text[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION birdview_private.sync_api_principal(p_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,birdview_private AS $$
DECLARE r public.api_keys; BEGIN
 IF NOT birdview_private.context_is_valid() OR NOT EXISTS(SELECT 1 FROM memberships WHERE organization_id=current_setting('app.organization_id') AND user_id=current_setting('app.user_id') AND active AND role IN('owner','admin')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.api_keys WHERE organization_id=current_setting('app.organization_id') AND id=p_id;
 IF NOT FOUND THEN UPDATE birdview_private.api_principals SET active=false WHERE organization_id=current_setting('app.organization_id') AND id=p_id;RETURN; END IF;
 INSERT INTO birdview_private.api_principals(id,organization_id,owner_id,key_hash,permissions,department_ids,active,expires_at,queries)
 VALUES(r.id,r.organization_id,current_setting('app.user_id'),coalesce(r.data->>'keyHash',r.data->>'hash'),ARRAY(SELECT jsonb_array_elements_text(r.data->'permissions')),ARRAY(SELECT jsonb_array_elements_text(r.data->'departmentIds')),coalesce((r.data->>'active')::boolean,true) AND coalesce(r.data->>'status','active')<>'revoked',nullif(r.data->>'expiresAt','')::timestamptz,ARRAY(SELECT jsonb_array_elements_text(r.data->'queries')))
 ON CONFLICT(id) DO UPDATE SET active=EXCLUDED.active,permissions=EXCLUDED.permissions,department_ids=EXCLUDED.department_ids,expires_at=EXCLUDED.expires_at,queries=EXCLUDED.queries;
END $$;
-- Garbage collection returns object handles only, never conversation text or mappings.
CREATE TABLE birdview_private.object_gc(organization_id text NOT NULL,storage_key text NOT NULL,backend text NOT NULL CHECK(backend IN('local','s3')),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,storage_key));
REVOKE ALL ON birdview_private.object_gc FROM PUBLIC,birdview_runtime,birdview_auth,birdview_vault;
CREATE TABLE birdview_private.deletion_tombstones(organization_id text PRIMARY KEY,deleted_at timestamptz NOT NULL,purged_at timestamptz);
GRANT SELECT,INSERT,UPDATE ON birdview_private.deletion_tombstones TO birdview_auth;
CREATE FUNCTION vault.expire_data() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,birdview_private,vault AS $$
DECLARE org record; conv record; n integer:=0; cd integer; rd integer; BEGIN
 SET CONSTRAINTS ALL DEFERRED;
 FOR org IN SELECT id FROM public.organizations WHERE deleted_at IS NULL ORDER BY id LIMIT 5000 LOOP
  SELECT greatest(1,least(365,coalesce((data->>'conversationRetentionDays')::integer,90))),greatest(1,least(365,coalesce((data->>'reportRetentionDays')::integer,90))) INTO cd,rd FROM public.privacy_policies WHERE organization_id=org.id ORDER BY created_at LIMIT 1;
  cd:=coalesce(cd,90);rd:=coalesce(rd,90);
  FOR conv IN SELECT id FROM public.conversations WHERE organization_id=org.id AND updated_at<now()-make_interval(days=>cd) LIMIT 1000 LOOP
   DELETE FROM public.answer_blocks WHERE organization_id=org.id AND data->>'messageId' IN(SELECT id FROM public.messages WHERE organization_id=org.id AND data->>'conversationId'=conv.id);
   DELETE FROM public.evidence_links WHERE organization_id=org.id AND (data->>'conversationId'=conv.id OR data->>'messageId' IN(SELECT id FROM public.messages WHERE organization_id=org.id AND data->>'conversationId'=conv.id));
   DELETE FROM public.messages WHERE organization_id=org.id AND data->>'conversationId'=conv.id;
   DELETE FROM public.query_executions WHERE organization_id=org.id AND data->>'conversationId'=conv.id;
   DELETE FROM vault.pseudonym_mappings WHERE organization_id=org.id AND scope_id=conv.id;
   DELETE FROM public.conversations WHERE organization_id=org.id AND id=conv.id;n:=n+1;
  END LOOP;
  INSERT INTO birdview_private.object_gc(organization_id,storage_key,backend) SELECT organization_id,data->>'storageKey',data->>'storageBackend' FROM public.artifacts WHERE organization_id=org.id AND (nullif(data->>'expiresAt','')::timestamptz<now() OR created_at<now()-make_interval(days=>rd)) AND data->>'storageKey' IS NOT NULL AND data->>'storageBackend' IN('local','s3') ON CONFLICT DO NOTHING;
  DELETE FROM public.artifacts WHERE organization_id=org.id AND (nullif(data->>'expiresAt','')::timestamptz<now() OR created_at<now()-make_interval(days=>rd));
  DELETE FROM public.report_runs WHERE organization_id=org.id AND created_at<now()-make_interval(days=>rd);
  DELETE FROM public.source_records WHERE organization_id=org.id AND created_at<now()-interval '24 hours';
  DELETE FROM public.privacy_decisions WHERE organization_id=org.id AND created_at<now()-interval '30 days';
  DELETE FROM public.audit_events WHERE organization_id=org.id AND created_at<now()-interval '12 months';
 END LOOP;
 DELETE FROM public."session" WHERE "expiresAt"<now();DELETE FROM public.verification WHERE "expiresAt"<now();
 DELETE FROM birdview_private.invitations WHERE expires_at<now();
 RETURN n;
END $$;
CREATE FUNCTION vault.pending_objects() RETURNS TABLE(organization_id text,storage_key text,backend text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,birdview_private AS $$SELECT organization_id,storage_key,backend FROM birdview_private.object_gc ORDER BY created_at LIMIT 200$$;
CREATE FUNCTION vault.ack_object(p_org text,p_key text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,birdview_private AS $$DELETE FROM birdview_private.object_gc WHERE organization_id=p_org AND storage_key=p_key$$;
REVOKE ALL ON FUNCTION vault.expire_data(),vault.pending_objects(),vault.ack_object(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vault.expire_data(),vault.pending_objects(),vault.ack_object(text,text) TO birdview_vault;
