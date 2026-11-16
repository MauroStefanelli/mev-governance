using System.Text.RegularExpressions;

// Il blocco "pre-patch" di Program.cs crea le tabelle all'avvio con db.Database.ExecuteSqlRaw($@"...").
// Quel testo viene letto DUE volte: da C# (stringa interpolata: {{ diventa {) e poi da Entity Framework, che lo rilegge come formato con segnaposto {0}, {1}.
// Una graffa letterale per il database ('{}'::jsonb) deve quindi essere scritta QUATTRO volte per lato ({{{{}}}}).
// Con {{}} Entity Framework riceveva '{}' e lanciava "Input string was not in a correct format": l'intero blocco, con 10 tabelle e le colonne successive, non veniva eseguito.
// Questi controlli non possono essere fatti sul database (i test usano SQLite in memoria): leggono il codice sorgente.
public static class StartupSqlRegression
{
    static string FindProgram()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "mev-governance-backend", "Program.cs"))) dir = dir.Parent;
        if (dir == null) throw new Exception("Program.cs del backend non trovato salendo dalla cartella dei test");
        return Path.Combine(dir.FullName, "mev-governance-backend", "Program.cs");
    }

    // I testi passati a ExecuteSqlRaw($@"...") in Program.cs, con il numero di riga di inizio.
    public static List<(int Line, string Text)> InterpolatedSqlBlocks(string source)
    {
        var lines = source.Split('\n'); var blocks = new List<(int, string)>();
        for (var i = 0; i < lines.Length; i++)
        {
            var at = lines[i].IndexOf("ExecuteSqlRaw($@\"", StringComparison.Ordinal);
            if (at < 0) continue;
            var text = new System.Text.StringBuilder(lines[i][(at + "ExecuteSqlRaw($@\"".Length)..]);
            var j = i;
            while (!text.ToString().Contains("\");") && j < lines.Length - 1) { j++; text.Append('\n').Append(lines[j]); }
            var body = text.ToString(); body = body[..body.IndexOf("\");", StringComparison.Ordinal)];
            blocks.Add((i + 1, body.Replace("\"\"", "\"")));
        }
        return blocks;
    }

    // Quello che Entity Framework riceve dopo che C# ha interpolato: {nome} diventa il valore, {{ diventa {, }} diventa }.
    public static string AfterCSharp(string block) => Regex.Replace(block, @"\{[A-Za-z_][A-Za-z0-9_.]*\}", "X").Replace("{{", "{").Replace("}}", "}");

    // Quello che il formato di EF accetta: segnaposto numerici {0}, e graffe letterali SOLO se raddoppiate. Qualunque altra graffa e' un errore di formato.
    public static List<string> FormatProblems(string afterCSharp)
    {
        var stripped = Regex.Replace(afterCSharp, @"\{[0-9]+\}", "").Replace("{{", "").Replace("}}", "");
        return Regex.Matches(stripped, "[{}]").Select(m => stripped.Substring(Math.Max(0, m.Index - 25), Math.Min(50, stripped.Length - Math.Max(0, m.Index - 25))).Replace("\n", " ")).ToList();
    }

    public static void Run(Action<bool, string> check)
    {
        var source = File.ReadAllText(FindProgram());
        var blocks = InterpolatedSqlBlocks(source);
        check(blocks.Count >= 20, $"il parser trova i blocchi di SQL di avvio di Program.cs (trovati {blocks.Count})");

        // 1) nessun blocco ha graffe che il formato di EF non sappia leggere
        foreach (var (line, text) in blocks)
        {
            var problems = FormatProblems(AfterCSharp(text));
            check(problems.Count == 0, $"Program.cs riga {line}: graffe non valide per Entity Framework ({problems.FirstOrDefault()})");
        }

        // 2) il caso reale: il valore JSON vuoto nel default di PC_DataRecords.payload
        var payload = blocks.First(b => b.Text.Contains("PC_DataRecords") && b.Text.Contains("::jsonb"));
        check(payload.Text.Contains("DEFAULT '{{{{}}}}'::jsonb"), "il default JSON vuoto di PC_DataRecords e' scritto {{{{}}}} (due livelli di raddoppio)");
        check(!payload.Text.Contains("'{{}}'"), "il default JSON vuoto NON e' scritto {{}} (Entity Framework lo leggerebbe come errore)");

        // 3) il controllo scova davvero il difetto originale
        var broken = payload.Text.Replace("'{{{{}}}}'", "'{{}}'");
        check(FormatProblems(AfterCSharp(broken)).Count > 0, "il controllo segnala il difetto originale ({{}}) se viene reintrodotto");
        check(FormatProblems(AfterCSharp("DEFAULT '{{{{}}}}'::jsonb")).Count == 0, "il controllo accetta la forma corretta ({{{{}}}})");
        check(FormatProblems(AfterCSharp("WHERE x = {0} AND y = {1}")).Count == 0, "il controllo accetta i segnaposto numerici di EF ({0}, {1})");
        check(FormatProblems(AfterCSharp("SELECT '{{0}}'")).Count == 0, "il controllo accetta {{0}} (graffa letterale + 0 + graffa letterale dopo C#)");

        // 4) il seed dell'amministratore usa davvero i segnaposto di EF per le password (non devono diventare graffe letterali)
        var seed = blocks.FirstOrDefault(b => b.Text.Contains("Seed MSTEFANE"));
        check(seed.Text != null && seed.Text.Contains("{{0}}") && seed.Text.Contains("{{1}}"), "il seed amministratore passa le password come {{0}} e {{1}} (segnaposto di EF dopo l'interpolazione)");
    }
}
