CREATE SCHEMA "soulsale";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_action_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_user_id" varchar(128) NOT NULL,
	"action" varchar(64) NOT NULL,
	"result" varchar(8) NOT NULL,
	"input" jsonb,
	"message" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"subject" text NOT NULL,
	"content" text,
	"ref_type" varchar(16) NOT NULL,
	"ref_id" uuid NOT NULL,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"owner_user_id" varchar(128),
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_agency_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"parent_agency_customer_id" uuid,
	"territory_id" uuid,
	"discount_tier" varchar(32),
	"manager_user_id" varchar(128),
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_agency_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agency_customer_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"revenue" numeric(18, 0) DEFAULT '0' NOT NULL,
	"ship" numeric(18, 0) DEFAULT '0' NOT NULL,
	"deposit" numeric(18, 0) DEFAULT '0' NOT NULL,
	"discount" numeric(18, 0) DEFAULT '0' NOT NULL,
	"debt_delta" numeric(18, 0) DEFAULT '0' NOT NULL,
	"confirmed_by" varchar(128),
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"beneficiary_type" varchar(12) NOT NULL,
	"beneficiary_id" varchar(128) NOT NULL,
	"base_amount" numeric(18, 0) NOT NULL,
	"amount" numeric(18, 0) NOT NULL,
	"period" varchar(7) NOT NULL,
	"status" varchar(12) DEFAULT 'posted' NOT NULL,
	"posted_by" varchar(128),
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_commission_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"basis" varchar(12) DEFAULT 'revenue' NOT NULL,
	"rate_pct" numeric(5, 2) NOT NULL,
	"beneficiary" varchar(12) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_counters" (
	"org_id" uuid NOT NULL,
	"key" varchar(32) NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_credit_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"limit_amount" numeric(18, 0) DEFAULT '0' NOT NULL,
	"hold" boolean DEFAULT false NOT NULL,
	"hold_reason" text,
	"payment_term_id" uuid,
	"updated_by" varchar(128),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" varchar(16) DEFAULT 'shipping' NOT NULL,
	"line" text NOT NULL,
	"ward" varchar(120),
	"district" varchar(120),
	"province" varchar(120),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_customer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" varchar(64),
	"phone" varchar(32),
	"email" varchar(160),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_customer_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ancestor_id" uuid NOT NULL,
	"descendant_id" uuid NOT NULL,
	"depth" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_customer_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"phone" varchar(32),
	"email" varchar(160),
	"tax_code" varchar(32),
	"segment_id" uuid,
	"owner_user_id" varchar(128),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"merged_into" uuid,
	"note" text,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"customer_id" uuid,
	"lead_id" uuid,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(18, 0) DEFAULT '0' NOT NULL,
	"expected_close" timestamp with time zone,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"lost_reason" text,
	"health" varchar(12) DEFAULT 'warm' NOT NULL,
	"owner_user_id" varchar(128),
	"last_activity_at" timestamp with time zone,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_debt_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"opening" numeric(18, 0) DEFAULT '0' NOT NULL,
	"invoiced" numeric(18, 0) DEFAULT '0' NOT NULL,
	"paid" numeric(18, 0) DEFAULT '0' NOT NULL,
	"closing" numeric(18, 0) DEFAULT '0' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" varchar(128)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"source_customer_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"file_name" text NOT NULL,
	"status" varchar(16) DEFAULT 'uploaded' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"exception_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_import_raw_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"buyer_name" text,
	"shop_name" text,
	"phone" varchar(32),
	"product_code" varchar(64),
	"qty" integer,
	"sale_amount" numeric(18, 0) DEFAULT '0' NOT NULL,
	"ship_fee" numeric(18, 0) DEFAULT '0' NOT NULL,
	"deposit" numeric(18, 0) DEFAULT '0' NOT NULL,
	"discount" numeric(18, 0) DEFAULT '0' NOT NULL,
	"debt" numeric(18, 0) DEFAULT '0' NOT NULL,
	"matched_customer_id" uuid,
	"confidence" numeric(4, 2) DEFAULT '0' NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"exception_kind" varchar(24)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_inbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"topic" varchar(64) NOT NULL,
	"payload" jsonb,
	"processed" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"phone" varchar(32),
	"email" varchar(160),
	"note" text,
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"disqualify_reason" text,
	"score" integer DEFAULT 0 NOT NULL,
	"owner_user_id" varchar(128),
	"converted_customer_id" uuid,
	"converted_deal_id" uuid,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_code" varchar(64) NOT NULL,
	"product_name" text NOT NULL,
	"qty" integer NOT NULL,
	"unit" varchar(24) DEFAULT 'cái' NOT NULL,
	"unit_price" numeric(18, 0) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_rate_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_order_status_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" varchar(16) NOT NULL,
	"to_status" varchar(16) NOT NULL,
	"reason" text,
	"actor_user_id" varchar(128),
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"quote_id" uuid,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"sub_total" numeric(18, 0) DEFAULT '0' NOT NULL,
	"discount_total" numeric(18, 0) DEFAULT '0' NOT NULL,
	"tax_total" numeric(18, 0) DEFAULT '0' NOT NULL,
	"grand_total" numeric(18, 0) DEFAULT '0' NOT NULL,
	"payment_term_id" uuid,
	"credit_override" boolean DEFAULT false NOT NULL,
	"hold_reason" text,
	"channel" varchar(16) DEFAULT 'b2b' NOT NULL,
	"territory_id" uuid,
	"owner_user_id" varchar(128),
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_payment_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"days" integer DEFAULT 0 NOT NULL,
	"deposit_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid,
	"kind" varchar(12) NOT NULL,
	"amount" numeric(18, 0) NOT NULL,
	"method" varchar(24) DEFAULT 'bank' NOT NULL,
	"external_ref" varchar(128),
	"note" text,
	"recorded_by" varchar(128),
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_price_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"channel" varchar(16) DEFAULT 'all' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_price_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"price_book_id" uuid NOT NULL,
	"product_code" varchar(64) NOT NULL,
	"customer_id" uuid,
	"segment_id" uuid,
	"agency_level" integer,
	"min_qty" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(18, 0) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"product_code" varchar(64) NOT NULL,
	"product_name" text NOT NULL,
	"qty" integer NOT NULL,
	"unit" varchar(24) DEFAULT 'cái' NOT NULL,
	"unit_price" numeric(18, 0) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 0) NOT NULL,
	"price_rule_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"deal_id" uuid,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"valid_until" timestamp with time zone,
	"total" numeric(18, 0) DEFAULT '0' NOT NULL,
	"note" text,
	"owner_user_id" varchar(128),
	"closed_reason" text,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_reconciliation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"detail" text,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" varchar(128),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_retailer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"parent_agency_customer_id" uuid,
	"shop_type" varchar(64),
	"territory_id" uuid,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" varchar(12) NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"meta" jsonb,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_split_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"category" varchar(16) NOT NULL,
	"amount" numeric(18, 0) NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ref_type" varchar(12) NOT NULL,
	"ref_id" uuid NOT NULL,
	"action" varchar(32) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scope" varchar(12) NOT NULL,
	"scope_id" varchar(128) NOT NULL,
	"period" varchar(7) NOT NULL,
	"target_amount" numeric(18, 0) NOT NULL,
	"achieved_amount" numeric(18, 0) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soulsale"."ss_territories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_aa_org_idx" ON "soulsale"."ss_action_audit" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_aa_action_idx" ON "soulsale"."ss_action_audit" USING btree ("org_id","action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_act_org_idx" ON "soulsale"."ss_activities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_act_ref_idx" ON "soulsale"."ss_activities" USING btree ("org_id","ref_type","ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_agp_org_idx" ON "soulsale"."ss_agency_profiles" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_agp_cust_uq" ON "soulsale"."ss_agency_profiles" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_as_org_idx" ON "soulsale"."ss_agency_statements" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_as_batch_uq" ON "soulsale"."ss_agency_statements" USING btree ("org_id","batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_ce_org_idx" ON "soulsale"."ss_commission_entries" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_ce_uq" ON "soulsale"."ss_commission_entries" USING btree ("org_id","plan_id","order_id","beneficiary_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_cp_org_idx" ON "soulsale"."ss_commission_plans" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_cp_org_code_uq" ON "soulsale"."ss_commission_plans" USING btree ("org_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_ctr_uq" ON "soulsale"."ss_counters" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_cl_org_idx" ON "soulsale"."ss_credit_limits" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_cl_cust_uq" ON "soulsale"."ss_credit_limits" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_addr_org_idx" ON "soulsale"."ss_customer_addresses" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_addr_cust_idx" ON "soulsale"."ss_customer_addresses" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_contacts_org_idx" ON "soulsale"."ss_customer_contacts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_contacts_cust_idx" ON "soulsale"."ss_customer_contacts" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_rel_org_idx" ON "soulsale"."ss_customer_relationships" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_rel_uq" ON "soulsale"."ss_customer_relationships" USING btree ("org_id","ancestor_id","descendant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_rel_desc_idx" ON "soulsale"."ss_customer_relationships" USING btree ("org_id","descendant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_seg_org_idx" ON "soulsale"."ss_customer_segments" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_seg_org_code_uq" ON "soulsale"."ss_customer_segments" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_customers_org_idx" ON "soulsale"."ss_customers" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_customers_org_code_uq" ON "soulsale"."ss_customers" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_customers_org_phone_idx" ON "soulsale"."ss_customers" USING btree ("org_id","phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_customers_org_name_norm_idx" ON "soulsale"."ss_customers" USING btree ("org_id","name_norm");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_deals_org_idx" ON "soulsale"."ss_deals" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_deals_org_code_uq" ON "soulsale"."ss_deals" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_deals_stage_idx" ON "soulsale"."ss_deals" USING btree ("org_id","stage_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_deals_cust_idx" ON "soulsale"."ss_deals" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_ds_org_idx" ON "soulsale"."ss_debt_snapshots" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_ds_uq" ON "soulsale"."ss_debt_snapshots" USING btree ("org_id","customer_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_ib_org_idx" ON "soulsale"."ss_import_batches" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_ib_org_code_uq" ON "soulsale"."ss_import_batches" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_irr_org_idx" ON "soulsale"."ss_import_raw_rows" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_irr_batch_idx" ON "soulsale"."ss_import_raw_rows" USING btree ("org_id","batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_ir_org_idx" ON "soulsale"."ss_import_rows" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_ir_batch_idx" ON "soulsale"."ss_import_rows" USING btree ("org_id","batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_ir_status_idx" ON "soulsale"."ss_import_rows" USING btree ("org_id","batch_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_ie_org_idx" ON "soulsale"."ss_inbox_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_ie_topic_idx" ON "soulsale"."ss_inbox_events" USING btree ("org_id","topic");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_leads_org_idx" ON "soulsale"."ss_leads" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_leads_status_idx" ON "soulsale"."ss_leads" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_oi_org_idx" ON "soulsale"."ss_order_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_oi_order_idx" ON "soulsale"."ss_order_items" USING btree ("org_id","order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_osl_org_idx" ON "soulsale"."ss_order_status_log" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_osl_order_idx" ON "soulsale"."ss_order_status_log" USING btree ("org_id","order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_o_org_idx" ON "soulsale"."ss_orders" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_o_org_code_uq" ON "soulsale"."ss_orders" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_o_cust_idx" ON "soulsale"."ss_orders" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_o_status_idx" ON "soulsale"."ss_orders" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_pt_org_idx" ON "soulsale"."ss_payment_terms" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_pt_org_code_uq" ON "soulsale"."ss_payment_terms" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_pay_org_idx" ON "soulsale"."ss_payments" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_pay_org_code_uq" ON "soulsale"."ss_payments" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_pay_order_idx" ON "soulsale"."ss_payments" USING btree ("org_id","order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_stage_org_idx" ON "soulsale"."ss_pipeline_stages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_stage_pipe_idx" ON "soulsale"."ss_pipeline_stages" USING btree ("org_id","pipeline_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_pipe_org_idx" ON "soulsale"."ss_pipelines" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_pipe_org_code_uq" ON "soulsale"."ss_pipelines" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_pb_org_idx" ON "soulsale"."ss_price_books" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_pb_org_code_uq" ON "soulsale"."ss_price_books" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_pr_org_idx" ON "soulsale"."ss_price_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_pr_lookup_idx" ON "soulsale"."ss_price_rules" USING btree ("org_id","product_code","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_qi_org_idx" ON "soulsale"."ss_quote_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_qi_quote_idx" ON "soulsale"."ss_quote_items" USING btree ("org_id","quote_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_q_org_idx" ON "soulsale"."ss_quotes" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_q_org_code_uq" ON "soulsale"."ss_quotes" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_rc_org_idx" ON "soulsale"."ss_reconciliation_cases" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_rc_batch_idx" ON "soulsale"."ss_reconciliation_cases" USING btree ("org_id","batch_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_rtp_org_idx" ON "soulsale"."ss_retailer_profiles" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_rtp_cust_uq" ON "soulsale"."ss_retailer_profiles" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_sc_org_idx" ON "soulsale"."ss_scores" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_sc_uq" ON "soulsale"."ss_scores" USING btree ("org_id","entity_type","entity_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_sr_org_idx" ON "soulsale"."ss_split_results" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_sr_uq" ON "soulsale"."ss_split_results" USING btree ("org_id","batch_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_sg_org_idx" ON "soulsale"."ss_suggestions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_sg_status_idx" ON "soulsale"."ss_suggestions" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_tg_org_idx" ON "soulsale"."ss_targets" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_tg_uq" ON "soulsale"."ss_targets" USING btree ("org_id","scope","scope_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ss_terr_org_idx" ON "soulsale"."ss_territories" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_terr_org_code_uq" ON "soulsale"."ss_territories" USING btree ("org_id","code");