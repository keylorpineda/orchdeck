import { CaretUpDown, Plus, Trash, UsersThree } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { RecipeCreateParams, RecipeRecord } from '@orchdeck/shared';
import { formatModelLabel, type ModelOption } from '../state/turn-stream';

export interface RecipePickerProps {
  readonly recipes: readonly RecipeRecord[];
  readonly selectedRecipeId: string | null;
  readonly modelOptions: readonly ModelOption[];
  readonly disabled?: boolean | undefined;
  readonly onSelectRecipe: (recipeId: string | null) => void;
  readonly onCreateRecipe: (params: RecipeCreateParams) => Promise<void>;
  readonly onDeleteRecipe: (recipeId: string) => Promise<void>;
}

export function RecipePicker({
  recipes,
  selectedRecipeId,
  modelOptions,
  disabled,
  onSelectRecipe,
  onCreateRecipe,
  onDeleteRecipe,
}: RecipePickerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [plannerModel, setPlannerModel] = useState(
    modelOptions[0]?.handle ?? 'antigravity:gemini-4-neon:high',
  );
  const [builderModel, setBuilderModel] = useState(
    modelOptions[0]?.handle ?? 'codex:gpt-5.4:high',
  );
  const [reviewerModel, setReviewerModel] = useState(
    modelOptions[0]?.handle ?? 'claude:opus-4-6:high',
  );
  const [maxReviewRetries, setMaxReviewRetries] = useState(2);

  const selected = recipes.find((r) => r.id === selectedRecipeId) ?? null;

  const handleCreate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (name.trim().length === 0) {
      return;
    }
    await onCreateRecipe({
      name: name.trim(),
      description: description.trim() || 'Custom 3-slot model fusion recipe',
      plannerModel,
      builderModel,
      reviewerModel,
      fallbackModel: 'claude:sonnet-4-6:medium',
      maxReviewRetries,
    });
    setName('');
    setDescription('');
    setCreating(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`orch-transition inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[11.5px] font-medium hover:border-border-strong disabled:opacity-50 ${
          selected
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-border-subtle bg-inset text-ink-secondary'
        }`}
        title="Model Fusion Recipe (Planner -> Builder -> Reviewer)"
      >
        <UsersThree size={13} weight="regular" />
        <span>{selected ? selected.name : 'Single Engine'}</span>
        <CaretUpDown size={12} weight="regular" />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Model Fusion Recipes"
          className="surface-card absolute bottom-[calc(100%+6px)] left-0 z-30 w-[340px] overflow-hidden shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-border-subtle bg-inset px-3 py-1.5 text-[11px] text-ink-secondary">
            <span>Fusion Team Pipeline</span>
            <button
              type="button"
              onClick={() => setCreating((prev) => !prev)}
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              <Plus size={11} weight="regular" />
              {creating ? 'Close' : 'New Recipe'}
            </button>
          </div>

          {creating ? (
            <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-2 p-3 text-[11.5px]">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Recipe name"
                className="rounded-[4px] border border-border-subtle bg-surface px-2 py-1 text-ink outline-none focus:border-accent"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short goal (optional)"
                className="rounded-[4px] border border-border-subtle bg-surface px-2 py-1 text-ink outline-none focus:border-accent"
              />
              <label className="flex flex-col gap-0.5 text-ink-secondary">
                <span>Planner (read-only)</span>
                <select
                  value={plannerModel}
                  onChange={(e) => setPlannerModel(e.target.value)}
                  className="rounded-[4px] border border-border-subtle bg-surface px-1.5 py-1 text-ink"
                >
                  {modelOptions.map((opt) => (
                    <option key={opt.handle} value={opt.handle}>
                      {opt.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-ink-secondary">
                <span>Builder</span>
                <select
                  value={builderModel}
                  onChange={(e) => setBuilderModel(e.target.value)}
                  className="rounded-[4px] border border-border-subtle bg-surface px-1.5 py-1 text-ink"
                >
                  {modelOptions.map((opt) => (
                    <option key={opt.handle} value={opt.handle}>
                      {opt.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-ink-secondary">
                <span>Reviewer (read-only)</span>
                <select
                  value={reviewerModel}
                  onChange={(e) => setReviewerModel(e.target.value)}
                  className="rounded-[4px] border border-border-subtle bg-surface px-1.5 py-1 text-ink"
                >
                  {modelOptions.map((opt) => (
                    <option key={opt.handle} value={opt.handle}>
                      {opt.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between text-ink-secondary">
                <span>Max review retries</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={maxReviewRetries}
                  onChange={(e) => setMaxReviewRetries(Number(e.target.value))}
                  className="tabular-mono w-[56px] rounded-[4px] border border-border-subtle bg-surface px-1.5 py-0.5 text-ink"
                />
              </label>
              <button
                type="submit"
                className="rounded-[4px] border border-accent bg-accent px-2.5 py-1 text-[11.5px] font-medium text-surface"
              >
                Save Recipe
              </button>
            </form>
          ) : (
            <div className="max-h-[260px] divide-y divide-border-subtle overflow-auto">
              <button
                type="button"
                onClick={() => {
                  onSelectRecipe(null);
                  setOpen(false);
                }}
                className={`orch-transition flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-inset ${
                  selected === null ? 'bg-inset' : 'bg-surface'
                }`}
              >
                <span className="text-[12px] font-medium text-ink">Single Engine</span>
                <span className="text-[11px] text-ink-secondary">
                  Run directly with the active Model Picker selection.
                </span>
              </button>

              {recipes.map((recipe) => {
                const isSelected = recipe.id === selectedRecipeId;
                return (
                  <div
                    key={recipe.id}
                    className={`flex items-start justify-between gap-2 px-3 py-2 hover:bg-inset ${
                      isSelected ? 'bg-inset' : 'bg-surface'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectRecipe(recipe.id);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                    >
                      <span className="truncate text-[12px] font-medium text-ink">{recipe.name}</span>
                      <span className="tabular-mono text-[10.5px] text-ink-tertiary">
                        {formatModelLabel(recipe.plannerModel, modelOptions)} {'→'}{' '}
                        {formatModelLabel(recipe.builderModel, modelOptions)} {'→'}{' '}
                        {formatModelLabel(recipe.reviewerModel, modelOptions)}
                      </span>
                    </button>
                    {!recipe.isBuiltin ? (
                      <button
                        type="button"
                        onClick={() => void onDeleteRecipe(recipe.id)}
                        title="Delete custom recipe"
                        className="p-1 text-ink-tertiary hover:text-fail"
                      >
                        <Trash size={12} weight="regular" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
