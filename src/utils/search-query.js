const toLower = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
const SIZE_UNITS = {
  b: 1,
  kb: 1024,
  k: 1024,
  mb: 1024 * 1024,
  m: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  g: 1024 * 1024 * 1024,
};

const isOperator = (token) => ['AND', 'OR', 'NOT'].includes(token);

const tokenize = (raw = '') => {
  const tokens = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === '(' || ch === ')') {
      if (current.trim()) tokens.push(current.trim());
      tokens.push(ch);
      current = '';
      continue;
    }

    if (/\s/.test(ch)) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) tokens.push(current.trim());
  return tokens;
};

const parseSize = (value = '') => {
  const match = value.match(/(>=|<=|>|<)?\s*([\d.]+)\s*([a-zA-Z]*)/);
  if (!match) return null;
  const [, opRaw, numRaw, unitRaw] = match;
  const op = opRaw || '>=';
  const num = parseFloat(numRaw || '0');
  if (Number.isNaN(num)) return null;
  const unit = (unitRaw || 'b').toLowerCase();
  const multiplier = SIZE_UNITS[unit] || 1;
  return { op, bytes: Math.round(num * multiplier) };
};

const clauseFromToken = (token = '') => {
  let raw = token;
  let negated = false;
  if (raw.startsWith('-') && raw.length > 1) {
    negated = true;
    raw = raw.slice(1);
  }

  const colonIndex = raw.indexOf(':');
  if (colonIndex === -1) {
    return { type: 'text', value: raw, negated };
  }

  const key = raw.slice(0, colonIndex).toLowerCase();
  const value = raw.slice(colonIndex + 1);

  switch (key) {
    case 'from':
    case 'to':
    case 'cc':
    case 'bcc':
    case 'subject':
      return { type: 'field', field: key, value, negated };
    case 'folder':
    case 'in':
      return { type: 'field', field: 'folder', value, negated };
    case 'label':
    case 'tag':
      return { type: 'field', field: 'label', value, negated };
    case 'is': {
      const lowered = value.toLowerCase();
      return { type: 'flag', flag: lowered, negated };
    }
    case 'has': {
      const lowered = value.toLowerCase();
      return { type: 'has', value: lowered, negated };
    }
    case 'before':
    case 'after':
    case 'on': {
      const ts = Date.parse(value);
      if (!Number.isFinite(ts)) return { type: 'unknown', value: raw, negated };
      return { type: 'date', field: key, value: ts, negated };
    }
    case 'size':
    case 'larger':
    case 'smaller':
    case 'larger_than':
    case 'smaller_than': {
      const parsedSize = parseSize(value);
      if (!parsedSize) return { type: 'unknown', value: raw, negated };
      const op =
        key === 'smaller' || key === 'smaller_than'
          ? '<='
          : key === 'larger' || key === 'larger_than'
            ? '>='
            : parsedSize.op;
      return { type: 'size', op, bytes: parsedSize.bytes, negated };
    }
    default:
      return { type: 'text', value: raw, negated };
  }
};

const precedence = (op) => {
  if (op === 'NOT') return 3;
  if (op === 'AND') return 2;
  if (op === 'OR') return 1;
  return 0;
};

const toAst = (tokens = []) => {
  const output = [];
  const ops = [];

  tokens.forEach((token) => {
    if (token === '(') {
      ops.push(token);
      return;
    }
    if (token === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') {
        output.push(ops.pop());
      }
      ops.pop(); // discard '('
      return;
    }

    const upper = token.toUpperCase();
    if (isOperator(upper)) {
      while (
        ops.length &&
        isOperator(ops[ops.length - 1]) &&
        precedence(ops[ops.length - 1]) >= precedence(upper)
      ) {
        output.push(ops.pop());
      }
      ops.push(upper);
      return;
    }

    output.push(clauseFromToken(token));
  });

  while (ops.length) {
    output.push(ops.pop());
  }

  // Build AST from RPN
  const stack = [];
  output.forEach((item) => {
    if (typeof item === 'string' && isOperator(item)) {
      const op = item;
      if (op === 'NOT') {
        const right = stack.pop();
        stack.push({ type: 'NOT', right });
      } else {
        const right = stack.pop();
        const left = stack.pop();
        stack.push({ type: op, left, right });
      }
    } else {
      stack.push({ type: 'CLAUSE', clause: item });
    }
  });

  return stack.pop() || null;
};

const matchesClause = (msg = {}, clause = {}) => {
  if (!clause) return true;
  const applyNegation = (result) => (clause.negated ? !result : result);

  switch (clause.type) {
    case 'text': {
      if (!clause.value) return true;
      const val = clause.value.toLowerCase();
      const subject = toLower(msg.subject);
      const from = toLower(msg.from);
      const snippet = toLower(msg.snippet || msg.preview || '');
      return applyNegation(subject.includes(val) || from.includes(val) || snippet.includes(val));
    }
    case 'field': {
      const value = toLower(clause.value);
      if (!value) return true;
      if (clause.field === 'from') {
        return applyNegation(toLower(msg.from).includes(value));
      }
      if (clause.field === 'to' || clause.field === 'cc' || clause.field === 'bcc') {
        const toVal = toLower(msg.to || '');
        const ccVal = toLower(msg.cc || '');
        const bccVal = toLower(msg.bcc || '');
        return applyNegation(
          toVal.includes(value) || ccVal.includes(value) || bccVal.includes(value),
        );
      }
      if (clause.field === 'subject') {
        return applyNegation(toLower(msg.subject).includes(value));
      }
      if (clause.field === 'folder') {
        const folder = toLower(msg.folder || msg.folder_path || msg.path || '');
        if (value === 'all' || value === 'anywhere') return applyNegation(true);
        return applyNegation(folder.includes(value));
      }
      if (clause.field === 'label') {
        const labels = (msg.labels || msg.labelIds || msg.label_ids || []).map((l) =>
          toLower(String(l)),
        );
        return applyNegation(labels.some((l) => l.includes(value)));
      }
      return true;
    }
    case 'flag': {
      const flag = (clause.flag || '').toLowerCase();
      if (flag === 'read') return applyNegation(!msg.is_unread);
      if (flag === 'unread') return applyNegation(Boolean(msg.is_unread));
      if (flag === 'starred' || flag === 'flagged') {
        const hasStar =
          msg.is_starred || (Array.isArray(msg.flags) && msg.flags.includes('\\Flagged'));
        return applyNegation(Boolean(hasStar));
      }
      if (flag === 'important' || flag === 'pinned') {
        const flags = Array.isArray(msg.flags) ? msg.flags.map((f) => toLower(f)) : [];
        return applyNegation(flags.includes('\\important') || flags.includes('important'));
      }
      if (flag === 'spam' || flag === 'junk') {
        const folder = toLower(msg.folder || '');
        return applyNegation(folder.includes('spam') || folder.includes('junk'));
      }
      if (flag === 'trash' || flag === 'deleted') {
        const folder = toLower(msg.folder || '');
        return applyNegation(folder.includes('trash') || folder.includes('deleted'));
      }
      return true;
    }
    case 'has': {
      const hasValue = (clause.value || '').toLowerCase();
      if (hasValue === 'attachment' || hasValue === 'attachments') {
        // Check both the flag and actual attachments array
        const hasAttachments =
          Boolean(msg.has_attachment) ||
          (Array.isArray(msg.attachments) && msg.attachments.length > 0);
        return applyNegation(hasAttachments);
      }
      return true;
    }
    case 'date': {
      const dateMs = msg.dateMs || msg.date || null;
      if (!dateMs) return false;
      const target = clause.value;
      if (clause.field === 'before') return applyNegation(dateMs < target);
      if (clause.field === 'after') return applyNegation(dateMs > target);
      if (clause.field === 'on') {
        const sameDay =
          new Date(dateMs).toDateString().toLowerCase() ===
          new Date(target).toDateString().toLowerCase();
        return applyNegation(sameDay);
      }
      return true;
    }
    case 'size': {
      const size =
        msg.size ||
        msg.Size ||
        msg.totalSize ||
        (Array.isArray(msg.attachments)
          ? msg.attachments.reduce((sum, att) => sum + (att.size || 0), 0)
          : 0);
      if (!size || Number.isNaN(size)) return false;
      if (clause.op === '>=') return applyNegation(size >= clause.bytes);
      if (clause.op === '<=') return applyNegation(size <= clause.bytes);
      if (clause.op === '>') return applyNegation(size > clause.bytes);
      if (clause.op === '<') return applyNegation(size < clause.bytes);
      return applyNegation(size >= clause.bytes);
    }
    default:
      return true;
  }
};

const evaluateAst = (ast, msg) => {
  if (!ast) return true;
  switch (ast.type) {
    case 'CLAUSE':
      return matchesClause(msg, ast.clause);
    case 'NOT':
      return !evaluateAst(ast.right, msg);
    case 'AND':
      return evaluateAst(ast.left, msg) && evaluateAst(ast.right, msg);
    case 'OR':
      return evaluateAst(ast.left, msg) || evaluateAst(ast.right, msg);
    default:
      return true;
  }
};

export function parseSearchQuery(raw = '') {
  const tokens = tokenize(raw || '');
  const hasBooleanTokens = tokens.some(
    (t) => isOperator(t.toUpperCase()) || t === '(' || t === ')',
  );
  const ast = toAst(tokens);

  const filters = {
    from: [],
    to: [],
    cc: [],
    bcc: [],
    subject: [],
    folder: null,
    labels: [],
    isUnread: null,
    isStarred: null,
    hasAttachment: null,
    before: null,
    after: null,
    size: null,
    scope: null,
    hasBoolean: hasBooleanTokens,
    ast,
  };

  const textParts = [];

  tokens.forEach((token) => {
    const upper = token.toUpperCase();
    if (isOperator(upper) || token === '(' || token === ')') return;
    const clause = clauseFromToken(token);
    if (clause.negated) {
      return; // tracked in AST; skip populating flattened filters
    }
    if (clause.type === 'text') {
      textParts.push(clause.value);
      return;
    }
    if (clause.type === 'field') {
      const value = clause.value.toLowerCase();
      switch (clause.field) {
        case 'from':
          filters.from.push(value);
          break;
        case 'to':
        case 'cc':
        case 'bcc':
          filters.to.push(value);
          break;
        case 'subject':
          filters.subject.push(value);
          break;
        case 'folder':
          filters.folder = value;
          filters.scope = value;
          break;
        case 'label':
          filters.labels.push(value);
          break;
        default:
          break;
      }
    }
    if (clause.type === 'flag') {
      const flag = clause.flag.toLowerCase();
      if (flag === 'unread') filters.isUnread = true;
      if (flag === 'read') filters.isUnread = false;
      if (flag === 'starred' || flag === 'flagged') filters.isStarred = true;
    }
    if (clause.type === 'has') {
      if (clause.value === 'attachment' || clause.value === 'attachments') {
        filters.hasAttachment = true;
      }
    }
    if (clause.type === 'date') {
      if (clause.field === 'before') filters.before = clause.value;
      if (clause.field === 'after') filters.after = clause.value;
    }
    if (clause.type === 'size') {
      filters.size = { op: clause.op, bytes: clause.bytes };
    }
  });

  return {
    text: textParts.join(' ').trim(),
    filters,
    ast,
  };
}

export function applySearchFilters(messages = [], filters = {}) {
  const {
    from = [],
    to = [],
    subject = [],
    labels = [],
    folder = null,
    isUnread = null,
    isStarred = null,
    hasAttachment = null,
    before = null,
    after = null,
    size = null,
    ast = null,
    hasBoolean = false,
  } = filters || {};

  const normalizedFolder = typeof folder === 'string' ? folder.toLowerCase() : null;
  const skipFolderFilter =
    !normalizedFolder || normalizedFolder === 'all' || normalizedFolder === 'anywhere';

  return (messages || []).filter((msg) => {
    if (!skipFolderFilter) {
      const msgFolder = toLower(msg.folder || msg.folder_path || '');
      if (msgFolder !== normalizedFolder) return false;
    }
    if (ast && hasBoolean) {
      return evaluateAst(ast, msg);
    }

    if (isUnread === true && !msg.is_unread) return false;
    if (isUnread === false && msg.is_unread) return false;
    if (isStarred === true) {
      const starred =
        msg.is_starred || (Array.isArray(msg.flags) && msg.flags.includes('\\Flagged'));
      if (!starred) return false;
    }
    if (hasAttachment === true) {
      // Check both the flag and actual attachments array
      const msgHasAttachments =
        msg.has_attachment || (Array.isArray(msg.attachments) && msg.attachments.length > 0);
      if (!msgHasAttachments) return false;
    }

    if (before && msg.dateMs && msg.dateMs > before) return false;
    if (after && msg.dateMs && msg.dateMs < after) return false;

    if (size && size.bytes) {
      const msgSize =
        msg.size ||
        msg.Size ||
        msg.totalSize ||
        (Array.isArray(msg.attachments)
          ? msg.attachments.reduce((sum, att) => sum + (att.size || 0), 0)
          : 0);
      if (msgSize) {
        if (size.op === '>=' && !(msgSize >= size.bytes)) return false;
        if (size.op === '<=' && !(msgSize <= size.bytes)) return false;
        if (size.op === '>' && !(msgSize > size.bytes)) return false;
        if (size.op === '<' && !(msgSize < size.bytes)) return false;
      }
    }

    const fromStr = toLower(msg.from);
    if (from.length && !from.some((f) => fromStr.includes(f))) return false;

    const toStr = toLower(msg.to || '');
    const ccStr = toLower(msg.cc || '');
    const bccStr = toLower(msg.bcc || '');
    if (to.length && !to.some((t) => toStr.includes(t) || ccStr.includes(t) || bccStr.includes(t)))
      return false;

    const subjStr = toLower(msg.subject);
    if (subject.length && !subject.some((s) => subjStr.includes(s))) return false;

    if (labels.length) {
      const messageLabels = (msg.labels || msg.labelIds || msg.label_ids || []).map((l) =>
        toLower(String(l)),
      );
      if (!labels.some((lbl) => messageLabels.some((ml) => ml.includes(lbl)))) return false;
    }

    return true;
  });
}
