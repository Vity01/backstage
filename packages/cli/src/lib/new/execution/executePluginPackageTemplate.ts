/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs-extra';
import chalk from 'chalk';
import {
  dirname,
  resolve as resolvePath,
  relative as relativePath,
} from 'path';

import { paths } from '../../paths';
import { PortableTemplate, PortableTemplateInput } from '../types';
import { ForwardedError } from '@backstage/errors';
import { TemporaryDirectoryManager } from './TemporaryDirectoryManager';
import { isMonoRepo as getIsMonoRepo } from '@backstage/cli-node';
import { PortableTemplater } from './PortableTemplater';

export async function executePluginPackageTemplate(
  template: PortableTemplate,
  input: PortableTemplateInput,
): Promise<{ targetDir: string }> {
  const targetDir = paths.resolveTargetRoot(input.packageParams.packagePath);

  const shortPluginDir = relativePath(paths.targetRoot, targetDir);
  if (await fs.pathExists(targetDir)) {
    throw new Error(
      `A package with the same plugin ID already exists at ${chalk.cyan(
        shortPluginDir,
      )}. Please try again with a different ID.`,
    );
  }

  const tmpDirManager = TemporaryDirectoryManager.create();

  try {
    const tempDir = await tmpDirManager.createDir('backstage-create');
    const isMonoRepo = await getIsMonoRepo();
    const templater = await PortableTemplater.create();

    const templatedValues = templater.templateRecord(
      template.templateValues,
      input.params,
    );

    for (const file of template.files) {
      if (isMonoRepo && file.path === 'tsconfig.json') {
        continue;
      }

      const destPath = resolvePath(tempDir, file.path);
      await fs.ensureDir(dirname(destPath));

      if (file.syntax === 'handlebars') {
        let content = file.content;

        if (file.syntax === 'handlebars') {
          content = templater.template(file.content, {
            ...input.params,
            ...templatedValues,
          });
        }

        await fs.writeFile(destPath, content).catch(error => {
          throw new ForwardedError(`Failed to copy file to ${destPath}`, error);
        });
      }
    }

    // Format package.json if it exists
    const pkgJsonPath = resolvePath(tempDir, 'package.json');
    if (await fs.pathExists(pkgJsonPath)) {
      const pkgJson = await fs.readJson(pkgJsonPath);
      await fs.writeJson(pkgJsonPath, pkgJson, { spaces: 2 });
    }

    await fs.move(tempDir, targetDir).catch(error => {
      throw new Error(
        `Failed to move package from ${tempDir} to ${targetDir}, ${error.message}`,
      );
    });

    return { targetDir };
  } finally {
    tmpDirManager.cleanup();
  }
}
