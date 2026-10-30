// The same values drive both row matching and the options of each facet.
export function createMevFilters(rows, filters, fields, textFields = []) {
  const values = (row, key) => {
    const field = fields[key];
    const raw = typeof field === "function" ? field(row) : row[field];
    const list = Array.isArray(raw) ? raw : [raw];
    const normalized = list.filter(v => v != null && String(v).trim() !== "").map(String);
    return normalized.length ? normalized : ["(vuoto)"];
  };
  const matches = (row, except) =>
    Object.keys(fields).every(key => key === except || !filters[key]?.length ||
      values(row, key).some(value => filters[key].includes(value))) &&
    textFields.every(key => key === except || !filters[key] ||
      String(row[key] ?? "").toLowerCase().includes(filters[key].toLowerCase()));
  return {
    filteredRows: rows.filter(row => matches(row)),
    options: (key, includeEmpty = false) => [...new Set(rows
      .filter(row => matches(row, key)).flatMap(row => values(row, key)))]
      .filter(value => includeEmpty || value !== "(vuoto)").sort(),
  };
}
