import { z } from 'zod';

import { modelsSchema } from '../chat-gpt/api';

export const scriptSchema = z.object({
    args: z.array(z.string()).nonempty(),
    parse: z.enum(['stdout', 'stderr'] as const),
    supportsFileFiltering: z.boolean(),
});

export const refactorConfigSchema = z.object({
    /**
     * Short name of the refactoring
     */
    name: z.string(),

    /**
     * Objective of the refactor
     */
    objective: z.string(),

    /**
     * GitHub repository which is the target of the refactor, could be
     * undefined if the target is current repository.
     */
    repository: z.string().url().optional(),

    /**
     * git ref to start the refactor from, could be undefined if the
     * target is currently checked out ref.
     */
    ref: z.string().optional(),

    /**
     * Whether to allow modified files in the working tree, before
     * starting the refactor. Defaults to false.
     */
    allowDirtyWorkingTree: z.boolean().optional().default(false),

    /**
     * Maximum amount of money we can spend on a single run
     */
    budgetCents: z.number().optional().default(10_00),

    /**
     * An optional list of package.json scripts to run before the
     * refactor starts
     */
    bootstrapScripts: z.array(z.string()).optional(),

    /**
     * The default model to use for the refactor
     */
    model: modelsSchema.optional().default('gpt-3.5-turbo'),

    /**
     * A map of step codes to models to use for that step
     */
    modelByStepCode: z.record(modelsSchema).optional().default({
        '**/enrich*': 'gpt-4',
        '**/plan*': 'gpt-4',
    }),

    /**
     * Whether to use a more expensive model when a step fails due
     * to the model not being able to generate a processable result.
     */
    useMoreExpensiveModelsOnRetry: z
        .record(modelsSchema, modelsSchema)
        .optional()
        .default({
            'gpt-3.5-turbo': 'gpt-4',
        }),

    /**
     * An optional list of package.json scripts to run after code
     * changes to lint and check the changed files for errors. Defaults
     * to ['tsc', 'eslint'].
     */
    lintScripts: z
        .array(
            z.object({
                args: z.array(z.string()).nonempty(),
                parse: z.enum(['stdout', 'stderr'] as const),
                supportsFileFiltering: z.boolean(),
            })
        )
        .default([
            {
                args: ['tsc'],
                parse: 'stdout',
                supportsFileFiltering: false,
            },
            {
                args: ['eslint'],
                parse: 'stdout',
                supportsFileFiltering: true,
            },
        ]),

    /**
     * An optional list of package.json scripts to run after code
     * changes to test the changed files. Defaults to ['jest'].
     *
     * When `jest` is used as a test runner, the `--findRelatedTests`
     * flag is used to only run tests that are related to the changed
     * files.
     */
    testScripts: z
        .array(
            z.object({
                args: z.array(z.string()).nonempty(),
                parse: z.enum(['stdout', 'stderr'] as const),
                supportsFileFiltering: z.boolean(),
            })
        )
        .default([
            {
                args: ['jest'],
                parse: 'stdout',
                supportsFileFiltering: true,
            },
        ]),
});

export type RefactorConfig = z.input<typeof refactorConfigSchema>;

export const refactorStepResultSchema = z.object({
    task: z.string(),
    fileContents: z.string(),
    commit: z.string(),
});

export type RefactorStepResult = z.infer<typeof refactorStepResultSchema>;

export const issueSchema = z.object({
    command: z.string(),
    issue: z.string(),
    filePath: z.string(),
    commit: z.string(),
    code: z.string().optional(),
});

export const refactorSuccessResultSchema = z.object({
    status: z.literal('success'),
    filePath: z.string(),
    issues: z.array(issueSchema),
    steps: z.array(refactorStepResultSchema),
    lastCommit: z.string().optional(),
});

export const refactorFailedResultSchema = z.object({
    status: z.literal('failure'),
    failureDescription: z.string(),
    filePath: z.string(),
    issues: z.array(issueSchema),
    steps: z.array(refactorStepResultSchema),
    lastCommit: z.string().optional(),
});

export const refactorResultSchema = z.discriminatedUnion('status', [
    refactorSuccessResultSchema,
    refactorFailedResultSchema,
]);

export type RefactorResult = z.infer<typeof refactorResultSchema>;

export const refactorFileResultSchema = z.object({
    file: refactorResultSchema,
});

export type RefactorFileResult = z.infer<typeof refactorFileResultSchema>;

export const refactorFilesRecordSchema = z.record(
    z.string(),
    z.array(refactorResultSchema)
);

export type RefactorResultByFilePathRecord = z.infer<
    typeof refactorFilesRecordSchema
>;

export const refactorFilesResultSchema = z.object({
    accepted: z.record(z.string(), z.array(refactorResultSchema)),
    discarded: z.record(z.string(), z.array(refactorFailedResultSchema)),
});

export type RefactorFilesResult = z.infer<typeof refactorFilesResultSchema>;

export const lastCommit = <T extends { commit: string }>(steps: T[]) => {
    return steps[steps.length - 1]?.commit;
};

export const pushRefactorFileResults = (opts: {
    result: RefactorResult;
    into: RefactorResultByFilePathRecord;
}) => {
    const array = opts.into[opts.result.filePath];
    if (array) {
        array.push(opts.result);
    } else {
        opts.into[opts.result.filePath] = [opts.result];
    }
};

export const mutateToMergeRefactorRecords = (opts: {
    from: RefactorResultByFilePathRecord;
    into: RefactorResultByFilePathRecord;
}) => {
    for (const [file, tasks] of Object.entries(opts.from)) {
        const existing = opts.into[file];
        if (existing) {
            opts.into[file] = existing.concat(tasks);
        } else {
            opts.into[file] = tasks;
        }
    }
};

export const mutateToMergeRefactorFilesResults = (opts: {
    from: RefactorFilesResult;
    into: RefactorFilesResult;
}) => {
    mutateToMergeRefactorRecords({
        from: opts.from.accepted,
        into: opts.into.accepted,
    });
    mutateToMergeRefactorRecords({
        from: opts.from.discarded,
        into: opts.into.discarded,
    });
};

export type Issue = z.infer<typeof issueSchema>;

export const checkIssuesResultSchema = z.object({
    checkedFiles: z.array(z.string()).optional(),
    issues: z.array(
        z.object({
            command: z.string(),
            issue: z.string(),
            filePath: z.string(),
            code: z.string().optional(),
        })
    ),
});

export type CheckIssuesResult = z.infer<typeof checkIssuesResultSchema>;
