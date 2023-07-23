import type { Project } from 'ts-morph';

import { makeTsFunction } from '../functions/makeTsFunction';
import { markdown } from '../markdown/markdown';
import { languageServiceReferences } from './references/languageServiceReferences';
import { nodeBuiltinReferences } from './references/nodeBuiltinReferences';
import type { Args, FileReferences } from './references/types';
import { argsSchema, resultSchema } from './references/types';

export async function references(
    project: Project,
    args: Args
): Promise<Array<FileReferences>> {
    const initialRefs = await languageServiceReferences(project, args);

    /**
     * This workaround is required as node builtins cause references to only
     * return single file references, even though the identifier might be used
     * in other files.
     *
     * NOTE: This is probably a deliberate performance optimization, but for our
     * use case - we want to provide all references consistently regardless of
     * where the identifier is coming from.
     */

    if (
        // detect the pattern of node builtins:
        initialRefs.size <= 2
    ) {
        const nodeBuiltin = Array.from(initialRefs.values()).find(
            (file) => file.package === '@types/node'
        );

        if (nodeBuiltin) {
            // find the module name of the node builtin:
            const moduleName = nodeBuiltin.references.find(
                (ref) => ref.module
            )?.module;

            if (moduleName) {
                const result = await nodeBuiltinReferences(project, {
                    ...args,
                    module: moduleName,
                    alreadyFoundFiles: initialRefs,
                });
                return Array.from(result.values()).map((entry) => entry);
            }
        }
    }

    return Array.from(initialRefs.values()).map((entry) => entry);
}

export const referencesFunction = makeTsFunction({
    argsSchema,
    resultSchema,
    name: 'references',
    description: markdown`
Finds all occurrences of an identifier with specified name in the repository.
Identifiers are function names, variable names, class names, etc. Identifiers
cannot have spaces in them.

This will find references in the entire repository, unless \`includeFilePaths\`
is specified. Specifying this option can be very useful when identifier is used
in a large number of source files.
    `,
    implementation: references,
});
