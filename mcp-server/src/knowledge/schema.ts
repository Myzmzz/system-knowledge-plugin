/**
 * Knowledge-base data contract.
 *
 * This module is the single source of truth for the shape of every YAML file
 * under `knowledge/`. It mirrors plunginintro.md §5 exactly. Every MCP tool and
 * every CLI command consumes the types and validators defined here — treat this
 * file as the interface boundary between the otherwise-independent modules.
 *
 * Conventions:
 *  - `featureId`, `journeyId`, `testPathId` are kebab-case keys in their maps.
 *  - Entity / state-machine names are PascalCase keys.
 *  - All validators are tolerant on read (`.passthrough()` where the doc leaves
 *    room to grow) but strict on the fields the doc specifies.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

/** kebab-case identifier used for features / journeys / test paths. */
export const IdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be kebab-case (a-z, 0-9, hyphen)");

export const MaturitySchema = z.enum([
  "idea",
  "prototype",
  "usable",
  "production",
]);
export type Maturity = z.infer<typeof MaturitySchema>;

/** Dependency edge kinds — plunginintro.md §5.3. */
export const DependencyTypeSchema = z.enum([
  "data",
  "state",
  "gate",
  "ui",
  "external",
]);
export type DependencyType = z.infer<typeof DependencyTypeSchema>;

/* ------------------------------------------------------------------ */
/* features.yaml — plunginintro.md §5.2                                */
/* ------------------------------------------------------------------ */

export const EntryPointSchema = z
  .object({
    page: z.string().optional(),
    route: z.string().optional(),
    menu: z.string().optional(),
  })
  .passthrough();
export type EntryPoint = z.infer<typeof EntryPointSchema>;

export const FeatureSchema = z
  .object({
    name: z.string().min(1),
    module: z.string().optional(),
    description: z.string().optional(),
    maturity: MaturitySchema.optional(),
    owner_role: z.string().optional(),
    entry_points: z.array(EntryPointSchema).default([]),
    code_refs: z.array(z.string()).default([]),
    depends_on: z.array(IdSchema).default([]),
    provides: z.array(z.string()).default([]),
    used_by: z.array(IdSchema).default([]),
    states: z.array(z.string()).default([]),
  })
  .passthrough();
export type Feature = z.infer<typeof FeatureSchema>;

export const FeaturesFileSchema = z.object({
  features: z.record(IdSchema, FeatureSchema).default({}),
});
export type FeaturesFile = z.infer<typeof FeaturesFileSchema>;

/* ------------------------------------------------------------------ */
/* dependencies.yaml — plunginintro.md §5.3                            */
/* ------------------------------------------------------------------ */

export const DependencyEdgeSchema = z
  .object({
    from: IdSchema,
    to: IdSchema,
    type: DependencyTypeSchema,
    reason: z.string().optional(),
  })
  .passthrough();
export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;

export const DependenciesFileSchema = z.object({
  dependencies: z.array(DependencyEdgeSchema).default([]),
});
export type DependenciesFile = z.infer<typeof DependenciesFileSchema>;

/* ------------------------------------------------------------------ */
/* entities.yaml — plunginintro.md §5.4                                */
/* ------------------------------------------------------------------ */

export const EntityFieldSchema = z
  .object({
    type: z.string(),
    required: z.boolean().optional(),
    /** Cross-entity reference, e.g. "Cluster.id". */
    ref: z.string().optional(),
    /** Allowed values when `type: enum`. */
    values: z.array(z.string()).optional(),
  })
  .passthrough();
export type EntityField = z.infer<typeof EntityFieldSchema>;

export const EntitySchema = z
  .object({
    description: z.string().optional(),
    fields: z.record(z.string(), EntityFieldSchema).default({}),
    used_by: z.array(IdSchema).default([]),
  })
  .passthrough();
export type Entity = z.infer<typeof EntitySchema>;

export const EntitiesFileSchema = z.object({
  entities: z.record(z.string(), EntitySchema).default({}),
});
export type EntitiesFile = z.infer<typeof EntitiesFileSchema>;

/* ------------------------------------------------------------------ */
/* states.yaml — plunginintro.md §5.5                                  */
/* ------------------------------------------------------------------ */

export const StateSchema = z
  .object({
    label: z.string().optional(),
    allowed_actions: z.array(z.string()).default([]),
    disabled_actions: z.array(z.string()).default([]),
    visible_pages: z.array(z.string()).default([]),
  })
  .passthrough();
export type State = z.infer<typeof StateSchema>;

export const StateMachineSchema = z
  .object({
    states: z.record(z.string(), StateSchema).default({}),
  })
  .passthrough();
export type StateMachine = z.infer<typeof StateMachineSchema>;

export const StatesFileSchema = z.object({
  state_machines: z.record(z.string(), StateMachineSchema).default({}),
});
export type StatesFile = z.infer<typeof StatesFileSchema>;

/* ------------------------------------------------------------------ */
/* journeys.yaml — plunginintro.md §5.6                                */
/* ------------------------------------------------------------------ */

export const JourneySchema = z
  .object({
    name: z.string().min(1),
    start: z.string().optional(),
    end: z.string().optional(),
    steps: z.array(IdSchema).default([]),
    /** featureId -> ordered recovery action labels. */
    failure_recovery: z.record(IdSchema, z.array(z.string())).default({}),
    acceptance: z.array(z.string()).default([]),
  })
  .passthrough();
export type Journey = z.infer<typeof JourneySchema>;

export const JourneysFileSchema = z.object({
  journeys: z.record(IdSchema, JourneySchema).default({}),
});
export type JourneysFile = z.infer<typeof JourneysFileSchema>;

/* ------------------------------------------------------------------ */
/* test-paths.yaml — plunginintro.md §5.7                              */
/* ------------------------------------------------------------------ */

export const TestPathSchema = z
  .object({
    name: z.string().min(1),
    target_feature: IdSchema,
    journey: IdSchema.optional(),
    preconditions: z.array(z.string()).default([]),
    steps: z.array(z.string()).default([]),
    assertions: z.array(z.string()).default([]),
    regression_scope: z.array(IdSchema).default([]),
  })
  .passthrough();
export type TestPath = z.infer<typeof TestPathSchema>;

export const TestPathsFileSchema = z.object({
  test_paths: z.record(IdSchema, TestPathSchema).default({}),
});
export type TestPathsFile = z.infer<typeof TestPathsFileSchema>;

/* ------------------------------------------------------------------ */
/* Combined knowledge base                                             */
/* ------------------------------------------------------------------ */

/** The six knowledge files, mapped to their root key + validator. */
export const KNOWLEDGE_FILES = {
  features: { file: "features.yaml", schema: FeaturesFileSchema },
  dependencies: { file: "dependencies.yaml", schema: DependenciesFileSchema },
  entities: { file: "entities.yaml", schema: EntitiesFileSchema },
  states: { file: "states.yaml", schema: StatesFileSchema },
  journeys: { file: "journeys.yaml", schema: JourneysFileSchema },
  testPaths: { file: "test-paths.yaml", schema: TestPathsFileSchema },
} as const;

export type KnowledgeFileKey = keyof typeof KNOWLEDGE_FILES;

/** Fully-loaded, validated knowledge base held in memory by the loader. */
export interface KnowledgeBase {
  features: Record<string, Feature>;
  dependencies: DependencyEdge[];
  entities: Record<string, Entity>;
  stateMachines: Record<string, StateMachine>;
  journeys: Record<string, Journey>;
  testPaths: Record<string, TestPath>;
}
