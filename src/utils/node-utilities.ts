import { fileSystem } from '@tensorflow/tfjs-node/dist/io/file_system.js';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const __OUTDIR = '';
// const __DSPATH: string = '';

export const bk_utils = {
    read: (datasetPath: string) => {
        let rawDataset;
        try {
            const rawData = fs.readFileSync(datasetPath);
            rawDataset = JSON.parse(rawData.toString()) as Array<any>;           
        } catch (error) {
            console.log('Read Err:', error);
            rawDataset = undefined;
        }

        return rawDataset; 
    },

    save: async (model: any) => {
        const timeStamp = Date.now();
        const modelOutFolder = path.resolve(__OUTDIR, timeStamp + '/');

        try {
            fs.mkdirSync(modelOutFolder, { recursive: true });
            await model.save(fileSystem(modelOutFolder)); // file://./model-1a

            const metaOutPath = path.resolve(modelOutFolder, 'metadata.json');
            const metadataStr = JSON.stringify(model.TRAINING_LABELS);
            const vocabOutPath = path.resolve(modelOutFolder, 'vocab.json');
            const vocab = JSON.stringify(model.VOCABULARY);
            fs.writeFileSync(metaOutPath, metadataStr, { encoding: 'utf8' });
            fs.writeFileSync(vocabOutPath, vocab, { encoding: 'utf8' });

            console.log(
                chalk.bgGreen.black(' info ') +
                chalk.green(` Model data saved to: `) +
                chalk.underline(`${modelOutFolder}\n`)
            );
        } catch (error) {
            console.log(chalk.red(`Oops! We couldn't save your model:\n${error}`));
        }

        return;
    }
}