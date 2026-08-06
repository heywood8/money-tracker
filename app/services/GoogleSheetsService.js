import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { getPreference, setPreference, PREF_KEYS } from './PreferencesDB';
import { queryAll } from './db';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// Configure GoogleSignin once at module load. No webClientId needed since we
// only need client-side access tokens (no server-side offline access).
GoogleSignin.configure({
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
  ],
});

/**
 * Get a valid access token using the native Google Sign-In SDK.
 * Throws 'not_signed_in' if the user has never signed in.
 * Throws 'refresh_failed' if getTokens fails (revoked or network error).
 * @returns {Promise<string>} Access token
 */
export const getValidAccessToken = async () => {
  if (!GoogleSignin.hasPreviousSignIn()) {
    throw new Error('not_signed_in');
  }
  try {
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken;
  } catch {
    throw new Error('refresh_failed');
  }
};

/**
 * Trigger native Google Sign-In UI and return the resulting access token.
 * Throws 'sign_in_cancelled' if the user dismisses the picker.
 * Throws 'auth_failed' on any other error.
 * @returns {Promise<string>} Access token
 */
export const signIn = async () => {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signIn();
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken;
  } catch (error) {
    console.error('[GoogleSignIn] signIn error:', JSON.stringify(error), 'code:', error?.code, 'message:', error?.message);
    if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new Error('sign_in_cancelled');
    }
    throw new Error('auth_failed');
  }
};

/**
 * Revoke Google access and sign out (clears the native session).
 * Safe to call even if the user has already revoked access externally.
 */
export const signOut = async () => {
  try {
    await GoogleSignin.revokeAccess();
  } catch {
    // Access may already be revoked; continue to sign out
  }
  await GoogleSignin.signOut();
};

/**
 * Build the 8-sheet data structure from a backup object.
 *
 * The "Planned Operations" sheet is gone as of Budgets v3 phase 3: planned
 * operations are now plan lines, exported in "Budget Plan Lines". Spreadsheets
 * created before this keep a stale tab — it is simply no longer written or read.
 * That sheet's `execution_account` / `last_executed_month` columns are likewise
 * legacy: the app stopped executing lines, but they keep round-tripping so an
 * older spreadsheet restores byte-for-byte.
 * @param {Object} backup - Backup object from createBackup()
 * @returns {Array<{range: string, values: Array<Array>}>}
 */
export const buildSheetsData = (backup) => {
  const {
    accounts, categories, operations, budgets, balance_history,
    budget_plans, budget_plan_lines, budget_plan_line_categories,
    budget_plan_line_groups, budget_plan_line_accounts,
  } = backup.data;

  const accountNames = new Map(accounts.map(a => [a.id, a.name]));
  const categoryNames = new Map(categories.map(c => [c.id, c.name]));
  // Line groups (migration 0022) — the name is for the reader, the ID is what
  // makes the round trip; a line carries both, like every other reference here.
  const groupNames = new Map((budget_plan_line_groups || []).map(g => [g.id, g.label]));

  // A line's full category set (migration 0021), keyed by line. Semicolon-joined
  // rather than comma-joined because a category NAME may well contain a comma —
  // and the two columns must split the same way to stay in step.
  const categoryIdsByLine = new Map();
  for (const link of budget_plan_line_categories || []) {
    if (!link.line_id || !link.category_id) continue;
    const current = categoryIdsByLine.get(link.line_id);
    if (current) current.push(link.category_id);
    else categoryIdsByLine.set(link.line_id, [link.category_id]);
  }
  // A backup taken before 0021 has no junction at all: fall back to the line's
  // single category_id so the exported sheet still says what it tracks.
  const lineCategoryIds = (line) => categoryIdsByLine.get(line.id)
    || (line.category_id ? [line.category_id] : []);

  // A line's source-account filter (migration 0024), same shape and same
  // semicolon join. No fallback column exists for it — a pre-0024 backup simply
  // has no filters, which exports as an empty pair of cells ("any account").
  const accountIdsByLine = new Map();
  for (const link of budget_plan_line_accounts || []) {
    if (!link.line_id || link.account_id == null || link.account_id === '') continue;
    const current = accountIdsByLine.get(link.line_id);
    if (current) current.push(link.account_id);
    else accountIdsByLine.set(link.line_id, [link.account_id]);
  }

  return [
    {
      range: 'Accounts!A1',
      values: [
        ['id', 'name', 'balance', 'currency', 'display_order', 'hidden', 'monthly_target'],
        ...accounts.map(a => [
          a.id, a.name, a.balance, a.currency,
          a.display_order ?? '', a.hidden ?? 0, a.monthly_target ?? '',
        ]),
      ],
    },
    {
      range: 'Operations!A1',
      values: [
        ['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description', 'account_id', 'category_id', 'to_account_id', 'exchange_rate', 'destination_amount', 'destination_currency'],
        ...operations.map(o => [
          o.id, o.date, o.type, o.amount,
          o.source_currency || '',
          categoryNames.get(o.category_id) || '',
          accountNames.get(o.account_id) || '',
          o.to_account_id ? (accountNames.get(o.to_account_id) || '') : '',
          o.description || '',
          o.account_id,
          o.category_id || '',
          o.to_account_id || '',
          o.exchange_rate || '',
          o.destination_amount || '',
          o.destination_currency || '',
        ]),
      ],
    },
    {
      range: 'Categories!A1',
      values: [
        ['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow'],
        ...categories.map(c => [
          c.id, c.name, c.type, c.category_type, c.icon || '',
          c.parent_id || '', c.color || '', c.is_shadow ?? 0,
        ]),
      ],
    },
    {
      range: 'Budgets!A1',
      values: [
        ['id', 'category', 'amount', 'currency', 'period_type', 'start_date', 'end_date', 'is_recurring', 'rollover_enabled', 'category_id'],
        ...(budgets || []).map(b => [
          b.id,
          categoryNames.get(b.category_id) || '',
          b.amount, b.currency, b.period_type, b.start_date, b.end_date || '',
          b.is_recurring, b.rollover_enabled,
          b.category_id || '',
        ]),
      ],
    },
    {
      range: 'Balance History!A1',
      values: [
        ['account', 'date', 'balance', 'account_id'],
        ...(balance_history || []).map(h => [
          accountNames.get(h.account_id) || '',
          h.date, h.balance,
          h.account_id,
        ]),
      ],
    },
    {
      range: 'Budget Plans!A1',
      values: [
        ['id', 'month', 'currency', 'expected_income'],
        ...(budget_plans || []).map(p => [
          p.id, p.month, p.currency, p.expected_income ?? '0',
        ]),
      ],
    },
    {
      range: 'Budget Plan Lines!A1',
      values: [
        ['id', 'plan_id', 'label', 'amount', 'comment', 'category', 'account', 'category_id', 'to_account_id', 'sort_order', 'is_recurring', 'currency', 'kind', 'execution_account', 'account_id', 'last_executed_month', 'categories', 'category_ids', 'include_children', 'group', 'group_id', 'spending_accounts', 'spending_account_ids'],
        ...(budget_plan_lines || []).map(l => {
          const ids = lineCategoryIds(l);
          const sourceIds = accountIdsByLine.get(l.id) || [];
          return [
            l.id, l.plan_id || '', l.label || '', l.amount, l.comment || '',
            categoryNames.get(l.category_id) || '',
            l.to_account_id ? (accountNames.get(l.to_account_id) || '') : '',
            l.category_id || '',
            l.to_account_id || '',
            l.sort_order ?? 0,
            l.is_recurring ?? 0,
            l.currency || '',
            l.kind || '',
            l.account_id ? (accountNames.get(l.account_id) || '') : '',
            l.account_id || '',
            l.last_executed_month || '',
            // The whole set the line tracks: names for the reader, IDs for the
            // round trip. `category`/`category_id` above stay as the primary one
            // so an older sheet layout keeps working unchanged.
            ids.map(id => categoryNames.get(id) || '').join(';'),
            ids.join(';'),
            l.include_children === 0 ? 0 : 1,
            l.group_id ? (groupNames.get(l.group_id) || '') : '',
            l.group_id || '',
            // The source-account filter (migration 0024): names for the reader,
            // IDs for the round trip. Both blank means "any account".
            sourceIds.map(id => accountNames.get(id) || '').join(';'),
            sourceIds.join(';'),
          ];
        }),
      ],
    },
    {
      // Line groups (migration 0022). A blank `amount` is the normal state: the
      // group's budget is then the sum of the lines pointing at it, so there is
      // nothing to write down — and `currency` only accompanies an override.
      range: 'Budget Line Groups!A1',
      values: [
        ['id', 'label', 'amount', 'currency', 'sort_order'],
        ...(budget_plan_line_groups || []).map(g => [
          g.id, g.label, g.amount ?? '', g.currency ?? '', g.sort_order ?? 0,
        ]),
      ],
    },
  ];
};

/**
 * Parse a Sheets API valueRange into an array of row objects.
 * Row 0 is the header; subsequent rows become key/value objects.
 * @param {Object|undefined} valueRange
 * @returns {Array<Object>}
 */
const parseSheet = (valueRange) => {
  const rows = valueRange?.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
};

/**
 * Import all app data from the saved Google Sheets spreadsheet.
 * Fetches all 8 sheets in one batchGet call, resolves foreign keys
 * (ID-first, name fallback), and returns a backup object compatible
 * with restoreBackup(). Does NOT call restoreBackup itself.
 *
 * @param {string} accessToken - Valid Google OAuth access token
 * @param {Function} [onProgress] - Optional callback({ step, status })
 *   Steps: 'connect' | 'parse'. Statuses: 'in_progress' | 'completed'.
 * @returns {Promise<Object>} Backup object matching createBackup() format
 */
export const importFromSheets = async (accessToken, onProgress) => {
  const report = (step, status) => onProgress?.({ step, status });

  // ── Step 1: connect ────────────────────────────────────────────────
  report('connect', 'in_progress');

  const spreadsheetId = await getPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID);
  if (!spreadsheetId) {
    throw new Error('no_spreadsheet_configured');
  }

  const sheetNames = ['Accounts', 'Operations', 'Categories', 'Budgets', 'Balance History', 'Budget Plans', 'Budget Plan Lines', 'Budget Line Groups'];
  const batchGet = (names) => fetch(
    `${SHEETS_API}/${spreadsheetId}/values:batchGet?${names.map(n => `ranges=${encodeURIComponent(n)}`).join('&')}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  let response = await batchGet(sheetNames);

  // A range naming a tab the spreadsheet doesn't have fails the WHOLE call with
  // a 400 — which is what every spreadsheet written by an older build would do
  // the moment a tab is added to the list above. Rather than paying for a
  // metadata read on every import, ask for the titles only once that happens and
  // retry with the ones that are actually there; the absent ones then parse as
  // empty (see findSheet below).
  if (!response.ok && response.status === 400) {
    const existingTitles = await getSheetTitles(accessToken, spreadsheetId);
    const presentSheetNames = sheetNames.filter(name => existingTitles.has(name));
    if (presentSheetNames.length === 0) {
      // Not one recognizable tab — this is some other spreadsheet, not a Penny
      // export. Say so instead of "successfully importing" nothing over the
      // user's whole database.
      throw new Error('fetch_sheets_failed');
    }
    response = await batchGet(presentSheetNames);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    if (response.status === 404) throw new Error('spreadsheet_not_found');
    throw new Error(data.error?.message || 'fetch_sheets_failed');
  }

  const { valueRanges = [] } = await response.json();
  report('connect', 'completed');

  // ── Step 2: parse ──────────────────────────────────────────────────
  report('parse', 'in_progress');

  // Find a sheet's valueRange by matching the tab name prefix
  const findSheet = (name) => {
    const vr = valueRanges.find(r => r.range?.startsWith(`${name}!`));
    return parseSheet(vr);
  };

  const accountRows = findSheet('Accounts');
  const categoryRows = findSheet('Categories');
  const operationRows = findSheet('Operations');
  const budgetRows = findSheet('Budgets');
  const historyRows = findSheet('Balance History');
  const budgetPlanRows = findSheet('Budget Plans');
  const budgetPlanLineRows = findSheet('Budget Plan Lines');
  // Absent from any spreadsheet written before migration 0022 — findSheet then
  // yields [], and every line imports ungrouped.
  const budgetLineGroupRows = findSheet('Budget Line Groups');

  // Build lookup maps: id->id (direct) and name->id (fallback)
  const accountIdMap = new Map();
  accountRows.forEach(a => {
    if (a.name) accountIdMap.set(a.name, String(a.id));
    if (a.id !== '' && a.id != null) accountIdMap.set(String(a.id), String(a.id));
  });

  const categoryIdMap = new Map();
  categoryRows.forEach(c => {
    if (c.name) categoryIdMap.set(c.name, String(c.id));
    if (c.id !== '' && c.id != null) categoryIdMap.set(String(c.id), String(c.id));
  });

  // Resolve a foreign key: prefer the ID column value, fall back to name column
  const resolveAccountId = (row, idCol, nameCol) => {
    if (row[idCol] !== '' && row[idCol] != null) {
      const byId = accountIdMap.get(String(row[idCol]));
      if (byId != null) return byId;
    }
    return row[nameCol] ? (accountIdMap.get(row[nameCol]) ?? null) : null;
  };

  // A blank/absent cell is "not stated" and reads as ON (the pre-0021
  // behaviour); only an explicit 0 turns the descendant roll-up off.
  const readIncludeChildren = (value) => (
    value === '' || value == null ? 1 : (Number(value) === 0 ? 0 : 1)
  );

  const resolveCategoryId = (row, idCol, nameCol) => {
    if (row[idCol] !== '' && row[idCol] != null) {
      const byId = categoryIdMap.get(String(row[idCol]));
      if (byId != null) return byId;
    }
    return row[nameCol] ? (categoryIdMap.get(row[nameCol]) ?? null) : null;
  };

  const now = new Date().toISOString();

  const accounts = accountRows.map(a => ({
    id: a.id !== '' ? a.id : undefined,
    name: a.name,
    balance: a.balance || '0',
    currency: a.currency || 'USD',
    display_order: a.display_order !== '' ? Number(a.display_order) : null,
    hidden: a.hidden !== '' ? Number(a.hidden) : 0,
    monthly_target: a.monthly_target || null,
    created_at: now,
    updated_at: now,
  }));

  const categories = categoryRows.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    category_type: c.category_type,
    parent_id: c.parent_id || null,
    icon: c.icon || null,
    color: c.color || null,
    is_shadow: c.is_shadow !== '' ? Number(c.is_shadow) : 0,
    created_at: now,
    updated_at: now,
  }));

  const operations = operationRows.map(o => ({
    type: o.type,
    amount: o.amount,
    account_id: resolveAccountId(o, 'account_id', 'account'),
    category_id: resolveCategoryId(o, 'category_id', 'category'),
    to_account_id: (o.to_account || o.to_account_id)
      ? resolveAccountId(o, 'to_account_id', 'to_account')
      : null,
    date: o.date,
    created_at: now,
    description: o.description || null,
    exchange_rate: o.exchange_rate || null,
    destination_amount: o.destination_amount || null,
    source_currency: o.currency || null,
    destination_currency: o.destination_currency || null,
  }));

  const budgets = budgetRows.map(b => ({
    id: b.id,
    category_id: resolveCategoryId(b, 'category_id', 'category'),
    amount: b.amount,
    currency: b.currency,
    period_type: b.period_type,
    start_date: b.start_date,
    end_date: b.end_date || null,
    is_recurring: b.is_recurring !== '' ? Number(b.is_recurring) : 1,
    rollover_enabled: b.rollover_enabled !== '' ? Number(b.rollover_enabled) : 0,
    created_at: now,
    updated_at: now,
  }));

  const balance_history = historyRows.map(h => ({
    account_id: resolveAccountId(h, 'account_id', 'account'),
    date: h.date,
    balance: h.balance,
    created_at: now,
  }));

  const budget_plans = budgetPlanRows.map(p => ({
    id: p.id,
    month: p.month,
    currency: p.currency,
    expected_income: p.expected_income || '0',
    created_at: now,
    updated_at: now,
  }));

  // Groups first: a line's group reference resolves against them. Same ID-first,
  // name-fallback shape as every other reference on this sheet, so a group the
  // user renamed by hand still lands on the right row.
  const budget_plan_line_groups = budgetLineGroupRows
    .filter(g => g.id && g.label)
    .map(g => ({
      id: g.id,
      label: g.label,
      // A blank amount is a DERIVED group; its currency goes with it.
      amount: g.amount === '' || g.amount == null ? null : String(g.amount),
      currency: (g.amount === '' || g.amount == null) ? null : (g.currency || null),
      sort_order: (g.sort_order !== '' && g.sort_order != null) ? Number(g.sort_order) : 0,
      created_at: now,
      updated_at: now,
    }));

  const groupIdMap = new Map();
  budget_plan_line_groups.forEach(g => {
    groupIdMap.set(String(g.id), String(g.id));
    if (g.label) groupIdMap.set(g.label, String(g.id));
  });

  const budget_plan_lines = budgetPlanLineRows.map(l => {
    const isRecurring = l.is_recurring !== '' && l.is_recurring != null ? Number(l.is_recurring) : 0;
    return {
      id: l.id,
      // A recurring (global template) line has no plan_id (migration 0019).
      plan_id: isRecurring ? null : (l.plan_id || null),
      label: l.label || null,
      amount: l.amount,
      comment: l.comment || null,
      // Exactly one target: resolve category or account, whichever the row carries.
      category_id: (l.category || l.category_id) ? resolveCategoryId(l, 'category_id', 'category') : null,
      to_account_id: (l.account || l.to_account_id) ? resolveAccountId(l, 'to_account_id', 'account') : null,
      sort_order: (l.sort_order !== '' && l.sort_order != null) ? Number(l.sort_order) : 0,
      is_recurring: isRecurring,
      // Since migration 0020 a one-off line may carry its own currency too, so
      // this is no longer gated on is_recurring.
      currency: l.currency || null,
      kind: l.kind || null,
      // Legacy execution account (see buildSheetsData) — preserved as stored.
      account_id: (l.execution_account || l.account_id)
        ? resolveAccountId(l, 'account_id', 'execution_account')
        : null,
      last_executed_month: l.last_executed_month || null,
      // Only an explicit 0 switches the roll-up off. A blank cell — every
      // pre-0021 sheet, and any row a user added by hand — means "not stated",
      // which is the default ON; `Number('')` is 0, so this cannot go through
      // a plain numeric comparison.
      include_children: readIncludeChildren(l.include_children),
      // Group membership. A reference to a group the sheet doesn't list drops to
      // null (the line imports ungrouped) rather than dangling into a failed FK.
      group_id: (l.group_id || l.group)
        ? (groupIdMap.get(String(l.group_id)) ?? groupIdMap.get(String(l.group)) ?? null)
        : null,
      created_at: now,
      updated_at: now,
    };
  });

  // Category links (migration 0021). Read from `category_ids` when the sheet has
  // it, else from the human-facing `categories` names — someone editing the
  // spreadsheet by hand will reach for the names column, and silently dropping
  // what they typed there would be the worst kind of quiet. A sheet with neither
  // (written before 0021) falls back to the single category the row already
  // resolved, so a line never comes back from a round trip tracking nothing.
  const budget_plan_line_categories = [];
  const splitList = (value) => String(value || '').split(';').map(part => part.trim()).filter(Boolean);
  for (let i = 0; i < budgetPlanLineRows.length; i++) {
    const row = budgetPlanLineRows[i];
    const line = budget_plan_lines[i];
    if (!line.id) continue;
    // Both columns go through categoryIdMap, which is keyed by ID *and* by name.
    const listed = [...splitList(row.category_ids), ...splitList(row.categories)]
      .map(token => categoryIdMap.get(token) ?? null)
      .filter(Boolean);
    const resolved = listed.length > 0 ? listed : (line.category_id ? [line.category_id] : []);
    const seen = new Set();
    for (const categoryId of resolved) {
      if (seen.has(categoryId)) continue;
      seen.add(categoryId);
      budget_plan_line_categories.push({ line_id: line.id, category_id: categoryId });
    }
    // Keep the denormalized primary inside the set it heads: a sheet whose
    // `category` cell was cleared while `categories` still lists targets would
    // otherwise import a line whose column and junction disagree.
    line.category_id = resolved[0] ?? null;
  }

  // Source-account filter (migration 0024). Same two-column shape as the
  // categories above — IDs when the sheet has them, names when someone filled
  // the readable column in by hand. There is deliberately NO fallback: a sheet
  // with neither column was written before 0024, and its lines counted spending
  // from any account, which is an empty filter.
  const budget_plan_line_accounts = [];
  for (let i = 0; i < budgetPlanLineRows.length; i++) {
    const row = budgetPlanLineRows[i];
    const line = budget_plan_lines[i];
    if (!line.id) continue;
    const listed = [...splitList(row.spending_account_ids), ...splitList(row.spending_accounts)]
      .map(token => accountIdMap.get(token) ?? null)
      .filter(Boolean);
    const seen = new Set();
    for (const accountId of listed) {
      if (seen.has(accountId)) continue;
      seen.add(accountId);
      budget_plan_line_accounts.push({ line_id: line.id, account_id: accountId });
    }
  }

  // Preserve current app preferences (language, theme, etc.) so they survive the restore.
  // Do NOT catch DB errors here — a locked or corrupted DB must abort the import loudly
  // rather than silently overwriting all user preferences with an empty set (#747).
  const app_metadata = await queryAll('SELECT * FROM app_metadata WHERE key != ?', ['db_version']);

  report('parse', 'completed');

  return {
    version: 1,
    timestamp: now,
    platform: 'native',
    data: {
      accounts,
      categories,
      operations,
      budgets,
      app_metadata,
      balance_history,
      // Planned operations are plan lines now (Budgets v3 phase 3) — the sheet is
      // no longer exported or read, so nothing is imported into the legacy table.
      planned_operations: [],
      budget_plans,
      budget_plan_lines,
      budget_plan_line_categories,
      budget_plan_line_groups,
      budget_plan_line_accounts,
    },
  };
};

const createSpreadsheet = async (accessToken) => {
  const response = await fetch(SHEETS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: 'Penny – export' },
      sheets: [
        { properties: { title: 'Accounts' } },
        { properties: { title: 'Operations' } },
        { properties: { title: 'Categories' } },
        { properties: { title: 'Budgets' } },
        { properties: { title: 'Balance History' } },
        { properties: { title: 'Budget Plans' } },
        { properties: { title: 'Budget Plan Lines' } },
        { properties: { title: 'Budget Line Groups' } },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'create_spreadsheet_failed');
  }
  return data.spreadsheetId;
};

/**
 * Titles of the tabs a spreadsheet actually has.
 *
 * Both the export and the import name their tabs by hand, and the Sheets API
 * rejects the WHOLE request (400, "Unable to parse range") when any range names
 * a tab that doesn't exist. A spreadsheet created by an older build of the app
 * has fewer tabs than today's list — so every call that spans them has to ask
 * first, or one added tab breaks every existing user's export.
 * @param {string} accessToken
 * @param {string} spreadsheetId
 * @returns {Promise<Set<string>>}
 */
const getSheetTitles = async (accessToken, spreadsheetId) => {
  const response = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    if (response.status === 404) throw new Error('spreadsheet_not_found');
    throw new Error(data.error?.message || 'get_sheet_ids_failed');
  }
  const data = await response.json();
  return new Set((data.sheets || []).map(s => s.properties?.title).filter(Boolean));
};

/**
 * Every tab's title → sheetId. One metadata read serves both jobs the export
 * needs it for: knowing which tabs are missing, and knowing the IDs to hang the
 * basic filters on.
 * @param {string} accessToken
 * @param {string} spreadsheetId
 * @returns {Promise<Map<string, number>>}
 */
const getSheetIdsByTitle = async (accessToken, spreadsheetId) => {
  const response = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    throw new Error(data.error?.message || 'get_sheet_ids_failed');
  }
  const data = await response.json();
  return new Map((data.sheets || []).map(s => [s.properties?.title, s.properties?.sheetId]));
};

/**
 * Create any of `sheetNames` the spreadsheet is missing, returning the IDs of the
 * ones created. A no-op when it already has them all, which is the usual case —
 * this exists for the spreadsheet a user has been exporting into since before the
 * newest tab was added, where naming an absent tab in a batchClear range fails
 * the whole call with a 400.
 * @param {string} accessToken
 * @param {string} spreadsheetId
 * @param {Array<string>} missing
 * @returns {Promise<Map<string, number>>}
 */
const addSheets = async (accessToken, spreadsheetId, missing) => {
  const response = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: missing.map(title => ({ addSheet: { properties: { title } } })),
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    throw new Error(data.error?.message || 'create_spreadsheet_failed');
  }
  // Each addSheet reply carries the new tab's properties, so the filters below
  // can be applied to a tab created moments ago without a second metadata read.
  const data = await response.json().catch(() => ({}));
  const added = new Map();
  for (const reply of data.replies || []) {
    const properties = reply.addSheet?.properties;
    if (properties?.title != null) added.set(properties.title, properties.sheetId);
  }
  return added;
};

const applyFilters = async (accessToken, spreadsheetId, sheetIds) => {
  const requests = sheetIds.map(sheetId => ({
    setBasicFilter: {
      filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0 } },
    },
  }));
  const response = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    throw new Error(data.error?.message || 'apply_filters_failed');
  }
  await response.json().catch(() => {});
};

const clearSheets = async (accessToken, spreadsheetId, ranges) => {
  const response = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ranges }),
  });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    throw new Error(data.error?.message || 'clear_sheets_failed');
  }
  await response.json().catch(() => {});
};

const writeSheets = async (accessToken, spreadsheetId, sheets) => {
  const response = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: sheets.map(s => ({ range: s.range, values: s.values })),
    }),
  });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    if (response.status === 429) throw new Error('quota_exceeded');
    throw new Error(data.error?.message || 'write_sheets_failed');
  }
  await response.json().catch(() => {});
};

/**
 * Export all app data to Google Sheets.
 * @param {string} accessToken - Valid Google OAuth access token
 * @param {Object} backup - Backup object from createBackup()
 * @param {Function} [onProgress] - Optional callback({ step, status }) for progress reporting.
 *   Steps: 'connect' | 'clear' | 'write'. Statuses: 'in_progress' | 'completed'.
 * @returns {Promise<string>} URL of the spreadsheet
 */
export const exportToSheets = async (accessToken, backup, onProgress) => {
  const report = (step, status) => onProgress?.({ step, status });

  report('connect', 'in_progress');
  let spreadsheetId = await getPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID);
  if (!spreadsheetId) {
    spreadsheetId = await createSpreadsheet(accessToken);
    await setPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID, spreadsheetId);
  }
  report('connect', 'completed');

  const sheets = buildSheetsData(backup);
  const sheetNames = sheets.map(s => s.range.split('!')[0]);

  report('clear', 'in_progress');
  // One metadata read up front, before anything names a range: a spreadsheet
  // from an older build lacks the newest tabs, and naming an absent one in a
  // batchClear range fails the entire call. The same read supplies the sheet IDs
  // the filters need at the end, so this costs no extra request in the common
  // case — it just moved from after the write to before the clear.
  const sheetIdByTitle = await getSheetIdsByTitle(accessToken, spreadsheetId);
  const missing = sheetNames.filter(name => !sheetIdByTitle.has(name));
  if (missing.length > 0) {
    const added = await addSheets(accessToken, spreadsheetId, missing);
    for (const [title, id] of added) sheetIdByTitle.set(title, id);
  }
  await clearSheets(accessToken, spreadsheetId, sheetNames);
  report('clear', 'completed');

  report('write', 'in_progress');
  await writeSheets(accessToken, spreadsheetId, sheets);
  const sheetIds = sheetNames
    .map(name => sheetIdByTitle.get(name))
    .filter(id => id !== undefined);
  await applyFilters(accessToken, spreadsheetId, sheetIds);
  report('write', 'completed');

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
};
