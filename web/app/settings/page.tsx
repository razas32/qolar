import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoriesPanel } from "@/components/settings/categories-panel";
import { RulesPanel } from "@/components/settings/rules-panel";
import { MappingsPanel } from "@/components/settings/mappings-panel";
import { RecategorizeButton } from "@/components/settings/recategorize-button";
import { fetchCategories, fetchRules } from "@/lib/api";

export default async function SettingsPage() {
  const [categories, rules] = await Promise.all([fetchCategories(), fetchRules()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories &amp; rules</h1>
          <p className="text-sm text-muted-foreground">
            Everything that decides where a transaction lands. Edits apply to new transactions immediately; use
            &ldquo;Re-run&rdquo; to apply them to history.
          </p>
        </div>
        <RecategorizeButton />
      </div>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories ({categories.length})</TabsTrigger>
          <TabsTrigger value="merchants">Merchant rules ({rules.overrides.length})</TabsTrigger>
          <TabsTrigger value="mappings">Bank categories ({rules.mappings.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="pt-4">
          <CategoriesPanel categories={categories} />
        </TabsContent>
        <TabsContent value="merchants" className="pt-4">
          <RulesPanel overrides={rules.overrides} merchantTypes={rules.merchant_types} categories={categories} />
        </TabsContent>
        <TabsContent value="mappings" className="pt-4">
          <MappingsPanel mappings={rules.mappings} categories={categories} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
