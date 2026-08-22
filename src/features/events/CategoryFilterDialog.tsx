import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HOBBY_CATALOG } from '@/lib/hobbyCategories';

interface CategoryFilterDialogProps {
  open: boolean;
  selectedCategoryIds: ReadonlySet<string>;
  selectedSubcategoryKeys: ReadonlySet<string>;
  selectedActivityKeys: ReadonlySet<string>;
  onOpenChange: (open: boolean) => void;
  onToggleCategory: (categoryId: string) => void;
  onToggleSubcategory: (subcategoryKey: string) => void;
  onToggleActivity: (activityKey: string) => void;
  onClear: () => void;
}

function toggledSet(current: ReadonlySet<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function CategoryFilterDialog({
  open,
  selectedCategoryIds,
  selectedSubcategoryKeys,
  selectedActivityKeys,
  onOpenChange,
  onToggleCategory,
  onToggleSubcategory,
  onToggleActivity,
  onClear,
}: CategoryFilterDialogProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());

  const clearAll = () => {
    onClear();
    setExpandedCategories(new Set());
    setExpandedSubcategories(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-5xl max-h-[90vh] overflow-y-auto p-0 sm:max-h-[85vh]">
        <div className="sticky top-0 z-20 border-b bg-card/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:px-6">
          <DialogHeader className="pr-10">
            <DialogTitle className="text-xl font-display font-bold">Kategóriák</DialogTitle>
            <DialogDescription>
              Választhatsz fő kategóriát, alkategóriát vagy konkrét tevékenységet is.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-between gap-3">
            <Button variant="outline" onClick={clearAll}>Kijelölések törlése</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => onOpenChange(false)}>Kész</Button>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          {HOBBY_CATALOG.map((category) => {
            const categorySelected = selectedCategoryIds.has(category.id);
            const categoryExpanded = expandedCategories.has(category.id);
            return (
              <section key={category.id} className="rounded-2xl border p-4 space-y-4" aria-labelledby={`category-${category.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <button
                    id={`category-${category.id}`}
                    type="button"
                    aria-pressed={categorySelected}
                    onClick={() => {
                      onToggleCategory(category.id);
                      setExpandedCategories((current) => toggledSet(current, category.id));
                    }}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      categorySelected
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-border bg-background hover:bg-muted/50'
                    }`}
                  >
                    <span aria-hidden="true">{category.emoji}</span> {category.name}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={categoryExpanded}
                    aria-controls={`category-content-${category.id}`}
                    aria-label={`${category.name} részletei`}
                    onClick={() => setExpandedCategories((current) => toggledSet(current, category.id))}
                  >
                    {categoryExpanded ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
                  </Button>
                </div>

                {categoryExpanded && (
                  <div id={`category-content-${category.id}`} className="space-y-3 pl-2">
                    {category.subcategories.map((subcategory) => {
                      const subcategoryKey = `${category.id}::${subcategory.id}`;
                      const subcategorySelected = selectedSubcategoryKeys.has(subcategoryKey);
                      const subcategoryExpanded = expandedSubcategories.has(subcategoryKey);
                      return (
                        <section key={subcategoryKey} className="rounded-xl border border-dashed p-3">
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              aria-pressed={subcategorySelected}
                              onClick={() => {
                                onToggleSubcategory(subcategoryKey);
                                setExpandedSubcategories((current) => toggledSet(current, subcategoryKey));
                              }}
                              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                subcategorySelected
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                  : 'border-border bg-background hover:bg-muted/50'
                              }`}
                            >
                              <span aria-hidden="true">{subcategory.emoji}</span> {subcategory.name}
                            </button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-expanded={subcategoryExpanded}
                              aria-controls={`subcategory-content-${subcategoryKey}`}
                              aria-label={`${subcategory.name} tevékenységei`}
                              onClick={() => setExpandedSubcategories((current) => toggledSet(current, subcategoryKey))}
                            >
                              {subcategoryExpanded ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
                            </Button>
                          </div>

                          {subcategoryExpanded && (
                            <div id={`subcategory-content-${subcategoryKey}`} className="flex flex-wrap gap-2 mt-3">
                              {subcategory.activities.map((activity) => {
                                const activityKey = `${category.id}::${subcategory.id}::${activity.id}`;
                                const activitySelected = selectedActivityKeys.has(activityKey);
                                return (
                                  <button
                                    key={activityKey}
                                    type="button"
                                    aria-pressed={activitySelected}
                                    onClick={() => onToggleActivity(activityKey)}
                                    className={`rounded-xl border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                      activitySelected
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                        : 'border-border bg-background hover:bg-muted/50'
                                    }`}
                                  >
                                    <span aria-hidden="true">{activity.emoji}</span> {activity.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
