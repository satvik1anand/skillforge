-- Keep database-level validation aligned with the Build Brief API contract.
-- This follows the initial foundation migration and is safe to apply only
-- after 202607190001_initial_foundation.sql.

ALTER TABLE public.builds
  ADD CONSTRAINT builds_definition_of_done_length
    CHECK (
      definition_of_done IS NULL
      OR char_length(btrim(definition_of_done)) BETWEEN 1 AND 4000
    ),
  ADD CONSTRAINT builds_audience_length
    CHECK (
      audience_or_stakeholder IS NULL
      OR char_length(btrim(audience_or_stakeholder)) BETWEEN 1 AND 1000
    ),
  ADD CONSTRAINT builds_constraints_length
    CHECK (
      constraints_summary IS NULL
      OR char_length(btrim(constraints_summary)) BETWEEN 1 AND 4000
    ),
  ADD CONSTRAINT builds_metric_label_length
    CHECK (
      metric_label IS NULL
      OR char_length(btrim(metric_label)) BETWEEN 1 AND 120
    ),
  ADD CONSTRAINT builds_metric_unit_length
    CHECK (
      metric_unit IS NULL
      OR char_length(btrim(metric_unit)) BETWEEN 1 AND 40
    ),
  ADD CONSTRAINT builds_metric_requires_label
    CHECK (
      metric_label IS NOT NULL
      OR (
        metric_unit IS NULL
        AND baseline_value IS NULL
        AND target_value IS NULL
      )
    ),
  ADD CONSTRAINT builds_baseline_is_not_nan
    CHECK (baseline_value IS NULL OR baseline_value <> 'NaN'::NUMERIC),
  ADD CONSTRAINT builds_target_is_not_nan
    CHECK (target_value IS NULL OR target_value <> 'NaN'::NUMERIC);
