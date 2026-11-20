/* ============================================================
   js/demo_client.js
   Cliente Supabase simulado para MODO DEMO (localStorage).
   Permite que el sistema funcione sin conexión a base de datos,
   guardando toda la información en localStorage (namespaced por APP_ID).
   ============================================================ */

function _demoTableKey(table) {
    return `demo_db__${table}`;
}

function _demoReadTable(table) {
    try {
        const raw = lsGet(_demoTableKey(table));
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
}

function _demoWriteTable(table, rows) {
    try { lsSet(_demoTableKey(table), JSON.stringify(rows || [])); } catch (e) {}
}

function _demoNextId(rows) {
    let max = 0;
    for (const r of (rows || [])) {
        const id = Number(r && r.id);
        if (!isNaN(id) && id > max) max = id;
    }
    return max + 1;
}

function _demoMatch(row, filters) {
    for (const f of (filters || [])) {
        if (f.op === 'eq') {
            if (String(row[f.col]) !== String(f.val)) return false;
        } else if (f.op === 'in') {
            const vals = (f.val || []).map(v => String(v));
            if (!vals.includes(String(row[f.col]))) return false;
        } else if (f.op === 'gte') {
            if (!(row[f.col] >= f.val)) return false;
        } else if (f.op === 'lte') {
            if (!(row[f.col] <= f.val)) return false;
        } else if (f.op === 'gt') {
            if (!(row[f.col] > f.val)) return false;
        } else if (f.op === 'lt') {
            if (!(row[f.col] < f.val)) return false;
        } else if (f.op === 'match') {
            const m = f.val || {};
            for (const k of Object.keys(m)) {
                if (String(row[k]) !== String(m[k])) return false;
            }
        }
    }
    return true;
}

function _demoApplyOrders(rows, orders) {
    const arr = rows.slice();
    for (let i = (orders || []).length - 1; i >= 0; i--) {
        const o = orders[i];
        const asc = o.ascending !== false;
        arr.sort((a, b) => {
            const va = a[o.col], vb = b[o.col];
            if (va == vb) return 0;
            if (va == null) return asc ? -1 : 1;
            if (vb == null) return asc ? 1 : -1;
            if (va < vb) return asc ? -1 : 1;
            if (va > vb) return asc ? 1 : -1;
            return 0;
        });
    }
    return arr;
}

function _demoPopulateRelations(table, rows) {
    if (table !== 'empleados') return rows;
    const deptos = _demoReadTable('departamentos');
    const cargos = _demoReadTable('cargos');
    return rows.map(e => ({
        ...e,
        departamentos: e.departamentos || deptos.find(d => String(d.id) === String(e.departamento_id)) || null,
        cargos: e.cargos || cargos.find(c => String(c.id) === String(e.cargo_id)) || null
    }));
}

function createDemoSupabaseClient() {
    function makeQuery(table) {
        const q = {
            _table: table,
            _op: 'select',
            _select: '*',
            _data: null,
            _filters: [],
            _orders: [],
            _limit: null,
            _single: false,
            _maybeSingle: false,
            _upsertOpts: null,
            select(cols) {
                this._select = cols || '*';
                // in supabase, select() can be chained after insert/update/upsert/delete to return rows
                if (this._op === 'select') this._op = 'select';
                return this;
            },
            insert(rows) {
                this._op = 'insert';
                this._data = rows;
                return this;
            },
            update(data) {
                this._op = 'update';
                this._data = data;
                return this;
            },
            delete() {
                this._op = 'delete';
                return this;
            },
            upsert(rows, opts) {
                this._op = 'upsert';
                this._data = rows;
                this._upsertOpts = opts || null;
                return this;
            },
            eq(col, val) { this._filters.push({ op: 'eq', col, val }); return this; },
            in(col, val) { this._filters.push({ op: 'in', col, val }); return this; },
            gte(col, val) { this._filters.push({ op: 'gte', col, val }); return this; },
            lte(col, val) { this._filters.push({ op: 'lte', col, val }); return this; },
            gt(col, val) { this._filters.push({ op: 'gt', col, val }); return this; },
            lt(col, val) { this._filters.push({ op: 'lt', col, val }); return this; },
            match(obj) { this._filters.push({ op: 'match', val: obj }); return this; },
            order(col, opts) { this._orders.push({ col, ascending: !(opts && opts.ascending === false) }); return this; },
            limit(n) { this._limit = n; return this; },
            single() { this._single = true; return this; },
            maybeSingle() { this._maybeSingle = true; return this; },
            then(resolve, reject) {
                try {
                    const result = this._execute();
                    return Promise.resolve(result).then(resolve, reject);
                } catch (e) {
                    return Promise.reject(e).then(resolve, reject);
                }
            },
            _execute() {
                let rows = _demoReadTable(this._table);
                let data = null;
                let error = null;
                const table = this._table;

                if (this._op === 'select') {
                    let out = rows.filter(r => _demoMatch(r, this._filters));
                    out = _demoPopulateRelations(table, out);
                    out = _demoApplyOrders(out, this._orders);
                    if (this._limit != null) out = out.slice(0, this._limit);
                    if (this._maybeSingle) data = out.length ? out[0] : null;
                    else if (this._single) data = out[0] || null;
                    else data = out;
                } else if (this._op === 'insert') {
                    const toInsert = Array.isArray(this._data) ? this._data : [this._data];
                    const inserted = [];
                    for (const item of toInsert) {
                        const row = { ...item };
                        if (row.id == null || row.id === '') row.id = _demoNextId(rows.concat(inserted));
                        if (!row.created_at) row.created_at = new Date().toISOString();
                        rows.push(row);
                        inserted.push({ ...row });
                    }
                    _demoWriteTable(table, rows);
                    data = _demoPopulateRelations(table, inserted);
                } else if (this._op === 'update') {
                    const updated = [];
                    rows = rows.map(r => {
                        if (_demoMatch(r, this._filters)) {
                            const nr = { ...r, ...(this._data || {}) };
                            updated.push({ ...nr });
                            return nr;
                        }
                        return r;
                    });
                    _demoWriteTable(table, rows);
                    data = _demoPopulateRelations(table, updated);
                } else if (this._op === 'delete') {
                    const remaining = [];
                    const deleted = [];
                    for (const r of rows) {
                        if (_demoMatch(r, this._filters)) deleted.push(r);
                        else remaining.push(r);
                    }
                    rows = remaining;
                    _demoWriteTable(table, rows);
                    data = deleted;
                } else if (this._op === 'upsert') {
                    const toUpsert = Array.isArray(this._data) ? this._data : [this._data];
                    const onConflict = (this._upsertOpts && this._upsertOpts.onConflict) ? String(this._upsertOpts.onConflict).split(',').map(s => s.trim()) : ['id'];
                    const resultRows = [];
                    for (const item of toUpsert) {
                        let idx = -1;
                        if (onConflict.length) {
                            idx = rows.findIndex(r => onConflict.every(k => String(r[k]) === String(item[k])));
                        }
                        if (idx >= 0) {
                            rows[idx] = { ...rows[idx], ...item };
                            resultRows.push({ ...rows[idx] });
                        } else {
                            const row = { ...item };
                            if (row.id == null || row.id === '') row.id = _demoNextId(rows.concat(resultRows));
                            if (!row.created_at) row.created_at = new Date().toISOString();
                            rows.push(row);
                            resultRows.push({ ...row });
                        }
                    }
                    _demoWriteTable(table, rows);
                    data = _demoPopulateRelations(table, resultRows);
                }

                return { data, error };
            }
        };
        return q;
    }

    return {
        from(table) { return makeQuery(table); },
        storage: {
            from(bucket) {
                return {
                    getPublicUrl(path) {
                        return { data: { publicUrl: path || '' } };
                    },
                    async remove(paths) {
                        return { data: null, error: null };
                    },
                    async upload(path, file) {
                        return { data: null, error: { message: 'Carga de archivos no disponible en modo demo' } };
                    }
                };
            }
        },
        rpc(name, params) {
            return Promise.resolve({ data: null, error: { message: 'RPC no disponible en modo demo' } });
        }
    };
}
