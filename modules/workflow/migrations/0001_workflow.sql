CREATE TABLE IF NOT EXISTS wf_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, code varchar(80) NOT NULL,
  name varchar(160) NOT NULL, domain varchar(60) NOT NULL, entity_type varchar(80) NOT NULL,
  steps_config jsonb NOT NULL, threshold_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code, version)
);
CREATE INDEX IF NOT EXISTS wf_definitions_org_code_idx ON wf_definitions(org_id, code);
CREATE INDEX IF NOT EXISTS wf_definitions_org_active_idx ON wf_definitions(org_id, is_active);
CREATE TABLE IF NOT EXISTS wf_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, definition_id uuid NOT NULL REFERENCES wf_definitions(id),
  entity_type varchar(80) NOT NULL, entity_id uuid NOT NULL, status varchar(24) NOT NULL DEFAULT 'pending',
  current_step_order integer, requested_by uuid NOT NULL, amount numeric(20,2), metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS wf_instances_org_status_idx ON wf_instances(org_id, status);
CREATE INDEX IF NOT EXISTS wf_instances_org_entity_idx ON wf_instances(org_id, entity_type, entity_id);
CREATE TABLE IF NOT EXISTS wf_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, instance_id uuid NOT NULL REFERENCES wf_instances(id) ON DELETE CASCADE,
  step_order integer NOT NULL, name varchar(160) NOT NULL, assignee_role varchar(80) NOT NULL, assignee_user_id uuid,
  status varchar(24) NOT NULL DEFAULT 'waiting', sla_deadline timestamptz, activated_at timestamptz, completed_at timestamptz,
  returned_count integer NOT NULL DEFAULT 0, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE (org_id, instance_id, step_order)
);
CREATE INDEX IF NOT EXISTS wf_steps_org_instance_idx ON wf_steps(org_id, instance_id, step_order);
CREATE INDEX IF NOT EXISTS wf_steps_org_status_idx ON wf_steps(org_id, status);
CREATE TABLE IF NOT EXISTS wf_approval_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, step_id uuid NOT NULL REFERENCES wf_steps(id), instance_id uuid NOT NULL REFERENCES wf_instances(id),
  actor_user_id uuid NOT NULL, action varchar(24) NOT NULL, comment text, attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  delegated_to_user_id uuid, acted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wf_actions_org_instance_idx ON wf_approval_actions(org_id, instance_id, acted_at);
CREATE INDEX IF NOT EXISTS wf_actions_org_step_idx ON wf_approval_actions(org_id, step_id);
CREATE TABLE IF NOT EXISTS wf_procedure_rollouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, definition_id uuid NOT NULL REFERENCES wf_definitions(id),
  rollout_code varchar(80) NOT NULL, title varchar(180) NOT NULL, status varchar(24) NOT NULL DEFAULT 'draft', target_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_from date, owner_user_id uuid, trace_source text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS wf_rollouts_org_status_idx ON wf_procedure_rollouts(org_id, status);
CREATE INDEX IF NOT EXISTS wf_rollouts_org_definition_idx ON wf_procedure_rollouts(org_id, definition_id);
CREATE TABLE IF NOT EXISTS wf_compliance_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, rollout_id uuid REFERENCES wf_procedure_rollouts(id), definition_id uuid REFERENCES wf_definitions(id),
  test_code varchar(80) NOT NULL, name varchar(180) NOT NULL, status varchar(24) NOT NULL DEFAULT 'planned', checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb, tested_by uuid, tested_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wf_compliance_org_status_idx ON wf_compliance_tests(org_id, status);
CREATE INDEX IF NOT EXISTS wf_compliance_org_definition_idx ON wf_compliance_tests(org_id, definition_id);
