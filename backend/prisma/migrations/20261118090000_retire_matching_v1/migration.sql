-- Retire Matching V1 execution without deleting historical configs or saved scores.
BEGIN;
UPDATE "scoring_configs" SET "is_active" = false WHERE "is_active" AND ("parameters"->>'engineVersion') IS DISTINCT FROM 'matching-v3.0.0';

INSERT INTO "scoring_configs" ("name","version","financial_weight","squad_weight","risk_weight","criteria_weights","parameters","is_active")
VALUES ('Matching V3',1,0.3,0.5,0.2,'{"financial":{"fee":0.45,"salary":0.35,"contract":0.2},"squad":{"role":1},"risk":{"injury":0.5,"resale":0.5}}'::jsonb,'{"engineVersion":"matching-v3.0.0","matrixVersion":"tactical-roles-v3-b70a5cddf2e4","settings":{"referenceMinMinutes":450,"minimumReferencePlayers":10,"smoothingPrior":30,"ratioMean":"ATTEMPT_WEIGHTED","fullMinutes":2000,"minutesWeight":0.2,"capBonus":20,"trackingTransfers":{"sprintsPer90":{"pressuresPer90":1},"distanceKmPer90":{"progressiveCarriesPer90":1}},"marketValueFeeMultiplier":1.15,"allowMarketValueFeeEstimate":true,"missingInjuryScore":null,"valuationMaxAgeDays":180,"valuationMinimumPoints":4,"volatilitySample":true}}'::jsonb,false)
ON CONFLICT ("name","version") DO NOTHING;

-- Preserve an active V3 config, otherwise activate the persisted default.
UPDATE "scoring_configs" SET "is_active" = true
WHERE "name" = 'Matching V3' AND "version" = 1
AND "parameters"->>'engineVersion' = 'matching-v3.0.0'
AND NOT EXISTS (SELECT 1 FROM "scoring_configs" WHERE "is_active");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "scoring_configs" WHERE "is_active" AND "parameters"->>'engineVersion' = 'matching-v3.0.0') THEN
    RAISE EXCEPTION 'Cannot activate Matching V3: reserved default name/version is occupied by a legacy config';
  END IF;
END $$;

ALTER TABLE "scoring_configs" ADD CONSTRAINT "scoring_configs_active_v3_only"
CHECK (NOT "is_active" OR COALESCE("parameters"->>'engineVersion' = 'matching-v3.0.0',false));
COMMIT;
