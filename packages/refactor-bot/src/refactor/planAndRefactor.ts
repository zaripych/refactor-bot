import { z } from 'zod';

import { CycleDetectedError } from '../errors/cycleDetectedError';
import { dispatch } from '../event-bus';
import { logger } from '../logger/logger';
import { planFilesComplete } from './actions/planFilesComplete';
import { scriptSchema } from './check';
import { planFiles, planFilesResultSchema } from './planFiles';
import { refactorBatch } from './refactorBatch';
import { resetToLastAcceptedCommit } from './resetToLastAcceptedCommit';
import type { RefactorFilesResult } from './types';
import {
    mutateToMergeRefactorFilesResults,
    refactorConfigSchema,
    refactorFilesResultSchema,
} from './types';

export const planAndRefactorInputSchema = refactorConfigSchema.augment({
    objective: z.string(),
    startCommit: z.string(),
    sandboxDirectoryPath: z.string(),
    scripts: z.array(scriptSchema),
    filesToEdit: z.array(z.string()),
});

export const planAndRefactorResultSchema = refactorFilesResultSchema.merge(
    z.object({
        planFilesResults: z.array(planFilesResultSchema),
    })
);

export const planAndRefactor = async (
    input: z.input<typeof planAndRefactorInputSchema>,
    deps = { dispatch }
) => {
    const files: RefactorFilesResult = {
        accepted: {},
        discarded: {},
    };

    const planFilesResults: Array<z.output<typeof planFilesResultSchema>> = [];

    const planResult = await planFiles(input);

    // The above function is cached, so we need to dispatch the result here
    deps.dispatch(planFilesComplete(planResult));

    planFilesResults.push({
        plannedFiles: [...planResult.plannedFiles],
        rawResponse: planResult.rawResponse,
    });

    const { plannedFiles } = planResult;

    while (plannedFiles.length > 0) {
        const result = await refactorBatch({
            plannedFiles,
            ...input,
        });

        await resetToLastAcceptedCommit({
            location: input.sandboxDirectoryPath,
            result,
        });

        mutateToMergeRefactorFilesResults({
            from: result,
            into: files,
        });

        const repeatedPlanResult = await planFiles(input).catch((err) => {
            if (err instanceof CycleDetectedError) {
                /**
                 * @note Ideally the planFiles function would
                 * be able to detect this and return an empty
                 * list instead.
                 */
                logger.warn(
                    'Cycle detected when planning files to change, this is likely result of the last batch of changes not producing any changes.',
                    {
                        error: err,
                        result,
                    }
                );
                return {
                    plannedFiles: [],
                    rawResponse: '',
                };
            }
            return Promise.reject(err);
        });

        // The above function is cached, so we need to dispatch the result here
        deps.dispatch(planFilesComplete(repeatedPlanResult));

        plannedFiles.splice(
            0,
            plannedFiles.length,
            ...repeatedPlanResult.plannedFiles
        );

        planFilesResults.push({
            plannedFiles: [...repeatedPlanResult.plannedFiles],
            rawResponse: repeatedPlanResult.rawResponse,
        });
    }

    return {
        ...files,
        planFilesResults,
    };
};
