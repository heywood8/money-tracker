/**
 * Migration 0028: Let a plan line track operations by LABEL
 *
 * An income line could say how much was expected ("Зарплата: 240 000") but not
 * which operations pay it off. Category was the only tracking dimension a line
 * had, and salary and its advance are the same income category — so the two
 * lines were indistinguishable to anything that counts, and the Budgets tab
 * could only compare the month's income against their SUM.
 *
 * `budget_plan_line_labels` is that missing dimension: the set of operation
 * labels whose income counts toward a line (labels live inside
 * `operations.description`, see app/utils/labelUtils.js). Semantics mirror the
 * category set — several labels are an OR, and the label set combines with the
 * line's categories by AND:
 *
 *   - labels only     → income carrying any of these labels, any category,
 *   - categories only → income in those categories, whatever it is labelled,
 *   - both            → the INTERSECTION,
 *   - neither         → the line declares expected income and tracks nothing
 *     per-line, exactly as every income line did before this migration.
 *
 * `label` is the label TEXT, not a foreign key: labels are free text parsed out
 * of a description, there is no labels table to reference. It is stored as the
 * user typed it (that is what the editor shows) and matched case-insensitively,
 * with the writer de-duplicating case-variants so the primary key cannot be
 * defeated by "Аванс" vs "аванс".
 *
 * The line-side FK cascades like budget_plan_line_categories: deleting a line
 * drops its labels. There is nothing to cascade from on the label side —
 * renaming a label on an operation simply stops that operation from counting.
 *
 * No backfill: no line could carry labels before, so every existing line starts
 * with an empty set, which means "not tracked by label".
 *
 * That is NOT the same as "nothing changes for an existing line". This migration
 * also gives an income line's CATEGORY set a meaning it did not have — until now
 * a category on an income line was context for the row and nothing counted it,
 * and from here it tracks that category's income the way an expense line tracks
 * its own. So an income line already carrying a category starts showing a
 * per-line actual after the upgrade, and two such lines sharing one category
 * (the salary/advance case this feature exists for) each report the whole
 * category's income until the user separates them by label. An income line with
 * no category is untouched: it still only declares expected income.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and crash with
 * `no such table: budget_plan_line_labels`.
 */

const sql = `CREATE TABLE IF NOT EXISTS \`budget_plan_line_labels\` (
	\`line_id\` text NOT NULL,
	\`label\` text NOT NULL,
	PRIMARY KEY (\`line_id\`, \`label\`),
	FOREIGN KEY (\`line_id\`) REFERENCES \`budget_plan_lines\`(\`id\`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_budget_plan_line_labels_label\` ON \`budget_plan_line_labels\` (\`label\`)`;

export default sql;
