function postgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function get(database, sql, parameters = []) {
  if (database.dialect === 'postgres') {
    const result = await database.query(postgresSql(sql), parameters);
    return result.rows[0] || null;
  }
  return database.prepare(sql).get(...parameters) || null;
}

async function all(database, sql, parameters = []) {
  if (database.dialect === 'postgres') {
    const result = await database.query(postgresSql(sql), parameters);
    return result.rows;
  }
  return database.prepare(sql).all(...parameters);
}

async function run(database, sql, parameters = []) {
  if (database.dialect === 'postgres') {
    const result = await database.query(postgresSql(sql), parameters);
    return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
  }
  if (/\bRETURNING\b/i.test(sql)) {
    const row = database.prepare(sql).get(...parameters);
    return { changes: row ? 1 : 0, lastInsertRowid: row?.id, rows: row ? [row] : [] };
  }
  return database.prepare(sql).run(...parameters);
}

module.exports = { all, get, run };
