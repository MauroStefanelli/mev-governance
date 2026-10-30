using System.Text.Json.Nodes;
using MevGovernanceBackend.Services;
public static class ContractPricingRegression
{
 public static int Run() {
  int checks=0;
  void Check(bool ok) { if(!ok) throw new Exception("Contract pricing regression"); checks++; }
  var row=JsonNode.Parse("""{"id":"driver-1","prezzoRealizzazioneMedio":9999,"prezziOfferto":[{"fascia":"Semplice","valore":800},{"fascia":"Medio","valore":1200},{"fascia":"Complesso","valore":4050}]}""")!;
  var prices=ContractCatalogPricing.Prices(row,true);
  Check((decimal)prices["REALIZZAZIONE"]!["Medio"]! ==1200);
  Check((decimal)prices["MODIFICA"]!["Semplice"]! ==120);
  Check((decimal)prices["MODIFICA"]!["Medio"]! ==360);
  Check((decimal)prices["MODIFICA"]!["Complesso"]! ==600);
  Check((decimal)ContractCatalogPricing.Prices(row,false)["REALIZZAZIONE"]!["Medio"]! ==9999);
  var catalog=JsonNode.Parse("""[{"id":"driver-1","prezzi":{"Realizzazione":{"Medio":0}}},{"id":"other"}]""")!.AsArray();
  Check(ContractCatalogPricing.RecoverMissing(catalog,new JsonArray(row.DeepClone()), true)==5);
  Check((decimal)catalog[0]!["prezzi"]!["Realizzazione"]!["Medio"]! ==0);
  Check(catalog[1]!["prezzi"]==null);
  Check(ContractCatalogPricing.RecoverMissing(catalog,new JsonArray(row.DeepClone()), true)==0);
  var missing=ContractCatalogPricing.Prices(JsonNode.Parse("""{"prezziOfferto":[] ,"prezzoRealizzazioneMedio":9999}""")!,true);
  Check(missing["REALIZZAZIONE"]!["Medio"]==null && missing["MODIFICA"]!["Medio"]==null);
  var duplicate=new JsonArray(row.DeepClone(),row.DeepClone());
  Check(ContractCatalogPricing.RecoverMissing(JsonNode.Parse("""[{"id":"driver-1"}]""")!.AsArray(),duplicate)==0);
  var baseRow=JsonNode.Parse("""{"id":"239","prezzoRealizzazioneMedio":3000,"prezzoModificaMedio":900,"prezziOfferto":[{"fascia":"Medio","valore":1200}]}""")!;
  var baseCatalog=JsonNode.Parse("""[{"id":"239","prezzi":{}}]""")!.AsArray();
  ContractCatalogPricing.RecoverMissing(baseCatalog,new JsonArray(baseRow));
  Check((decimal)baseCatalog[0]!["prezzi"]!["REALIZZAZIONE"]!["Medio"]! ==3000);
  Check((decimal)baseCatalog[0]!["prezzi"]!["MODIFICA"]!["Medio"]! ==900);
  return checks;
 }
}
