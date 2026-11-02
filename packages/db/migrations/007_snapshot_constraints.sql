GRANT DELETE ON birdview_private.deletion_tombstones TO birdview_auth;
ALTER TABLE public.messages ALTER COLUMN created_at SET DEFAULT clock_timestamp();
-- JSON data is flexible, but common monetary fields cannot silently become floats or currencies implicit.
CREATE FUNCTION birdview_private.valid_money_data(d jsonb,fields text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM unnest(fields) f WHERE d ? f AND (jsonb_typeof(d->f)<>'number' OR d->>f !~ '^\d+$' OR (d->>f)::numeric>9007199254740991));
$$;
GRANT EXECUTE ON FUNCTION birdview_private.valid_money_data(jsonb,text[]) TO birdview_runtime;
ALTER TABLE public.invoices ADD CONSTRAINT invoice_money CHECK(birdview_private.valid_money_data(data,ARRAY['totalMinor','paidMinor','creditMinor']) AND (data->>'currency') ~ '^[A-Z]{3}$' AND coalesce((data->>'paidMinor')::numeric,0)+coalesce((data->>'creditMinor')::numeric,0)<=coalesce((data->>'totalMinor')::numeric,0));
ALTER TABLE public.opportunities ADD CONSTRAINT opportunity_money CHECK(birdview_private.valid_money_data(data,ARRAY['valueMinor']) AND (data->>'currency') ~ '^[A-Z]{3}$');
ALTER TABLE public.payments ADD CONSTRAINT payment_money CHECK(birdview_private.valid_money_data(data,ARRAY['amountMinor']) AND (data->>'currency') ~ '^[A-Z]{3}$');
