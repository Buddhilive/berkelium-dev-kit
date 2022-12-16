import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-node';
import { fileSystem } from '@tensorflow/tfjs-node/dist/io/file_system.js';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Tokenizer } from '../core/tokenizer';
import { TextEncorder } from '../core/encorder';

export class IntentClassification {

    private __DSPATH: string = ''
    private __OUTDIR: string = '';

    private INTENT_PATTERNS: Array<any> = [];
    private INTENT_CLASSES: Array<any> = [];
    private TRAINING_DATA: Array<any> = [];
    private TRAINING_LABELS: Array<string> = [];

    private TRAIN_EPOCHS: number = 10;
    private INPUT_LENGTH: number = 1;
    private VOCABULARY: any;

    constructor(datasetPath: string, outputPath: string) {
        this.__DSPATH = datasetPath;
        this.__OUTDIR = outputPath;
    }

    async init() {
        try {
            const rawData = fs.readFileSync(this.__DSPATH);
            const rawDataset = JSON.parse(rawData.toString()) as Array<any>;

            console.log(chalk.bgGreen.black(' info ') + chalk.greenBright(' Data Loaded Successfully\n'));

            this.prepareTrainingData(rawDataset);

        } catch (error) {
            console.log(chalk.red(' error ') + chalk.redBright(' Data read error: '), error);
        }
    }

    private async prepareTrainingData(trainingData: Array<any>) {

        console.log(
            chalk.bgGreen.black(' info ') +
            chalk.greenBright(` Data Encoding Started: ${trainingData.length} inputs\n`)
        );

        try {
            const intentLabels = trainingData.map((dataObj: Array<string>) => {
                if (!this.TRAINING_LABELS.includes(dataObj[1])) {
                    this.TRAINING_LABELS.push(dataObj[1]);
                }
                this.TRAINING_DATA.push(dataObj[0]);
            });

            Promise.all(intentLabels).then(async () => {
                await this.generateVocabulary(this.TRAINING_DATA.flat());

                const encodedDS = trainingData.map(async (dataObj: Array<string>) => {
                    const patternEmbeddings: any = await this.getEmbeddings(dataObj[0]);
                    const classEmbeddings = await this.classOneHotEncode(dataObj[1]);
                    this.INTENT_PATTERNS.push(patternEmbeddings);
                    this.INTENT_CLASSES.push(classEmbeddings);
                    // console.log(`sample encoding?: ${patternEmbeddings.length}`);
                });

                Promise.all(encodedDS).then(() => {
                    this.trainModel();
                });
            });

        } catch (error) {
            console.error(chalk.redBright('Encoding Error:'), error);
        }
    }

    private generateVocabulary(textData: Array<string>) {
        const bkTokenizer = new Tokenizer();
        const tokenCollection: Array<any> = [];

        return new Promise((resolve)=>{
            const getVocab = textData.map(async (sentence)=>{
                let tokens = await bkTokenizer.initialize(sentence);
                tokenCollection.push(tokens);
            });
            
            Promise.all(getVocab).then(async()=>{
                const bkEncoder = new TextEncorder();
                this.VOCABULARY = await bkEncoder.encode(tokenCollection.flat());
                console.log(Object.keys(this.VOCABULARY).length);
                resolve(this.VOCABULARY);
            });
        });
    }

    private async getEmbeddings(sentence: string) {
        const bkTokenizer = new Tokenizer();

        let tokens = await bkTokenizer.initialize(sentence);

        if (this.INPUT_LENGTH < tokens.length) {
            this.INPUT_LENGTH = tokens.length;
        }

        const embedding = await this.assignTokenNumber(tokens);

        return embedding;
    }

    private assignTokenNumber(tokens: Array<string>) {

        const numPad = this.INPUT_LENGTH - tokens.length;
        const zeroPads = tf.zeros([1, numPad]).arraySync() as Array<number>;

        // console.log(`pad?: ${numPad} => ${tokens.length} ${typeof zeroPads}`);
        return new Promise((resolve, reject) => {
            try {
                let finalEmbedding: Array<any> = [];
                const mapToken = tokens.map((word) => {
                    finalEmbedding.push(this.VOCABULARY[word]);
                });

                Promise.all(mapToken).then(() => {
                    finalEmbedding = finalEmbedding.concat(zeroPads[0]);
                    resolve(finalEmbedding);
                }).catch((err) => { reject(err) });
            } catch (error) {
                console.log('Tokenizing:', error);
            }
        });
    }

    private classOneHotEncode(className: string) {
        let classVector = tf.zeros([1, this.TRAINING_LABELS.length]).arraySync() as Array<any>;
        const classIndex = this.TRAINING_LABELS.indexOf(className);
        classVector[0][classIndex] = 1;
        // console.log(classVector);
        return classVector[0];
    }

    private async trainModel() {

        const trainX = tf.data.array(this.INTENT_PATTERNS);
        const trainY = tf.data.array(this.INTENT_CLASSES);
        const length = this.TRAINING_LABELS.length;
        const batchSize = this.INTENT_PATTERNS.length;
        const xyDataset = tf.data.zip({ xs: trainX, ys: trainY }).batch(batchSize);
        const inputShape = [22];

        console.log(xyDataset);

        const embeddings = tf.layers.embedding({
            inputDim: Object.keys(this.VOCABULARY).length,
            outputDim: 16,
            inputShape: inputShape,
            name: 'bkEmbed',
            maskZero: true
        });

        const model = tf.sequential();
        model.add(embeddings);
        /* model.add(tf.layers.dense({ inputShape: inputShape, units: 64, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.5 })); */
        // model.add(tf.layers.globalAveragePooling1d());
        model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        // model.add(tf.layers.dropout({ rate: 0.5 }));
        model.add(tf.layers.dense({ units: length, activation: 'softmax' }));
        model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
        // console.log(trainX.shape, this.INTENT_PATTERNS[5], this.INTENT_PATTERNS[5].length);

        model.summary()

        try {
            await model.fitDataset(xyDataset, {
                epochs: this.TRAIN_EPOCHS,
                verbose: 1,
                callbacks: tf.callbacks.earlyStopping({ monitor: 'acc' })
            }).then((info: any) => {

                const infoIndex = info.epoch.length - 1;
                const finalLoss = info.history.loss[infoIndex].toFixed(5);
                const finalAcc = info.history.acc[infoIndex].toFixed(5);

                console.log(
                    chalk.bgYellow.black(`\n Berkelium `) +
                    chalk.greenBright(` Training Completed at ${info.epoch.length} ==>`) +
                    chalk.yellowBright(` Loss: ${finalLoss}`) +
                    chalk.green(` | Accuracy: ${finalAcc}\n`)
                );
                this.saveModelData(model);
            });
        } catch (err) {
            console.log('Prom Err:', err)
        };
    }

    private async saveModelData(model: any) {
        const timeStamp = Date.now();
        const modelOutFolder = path.resolve(this.__OUTDIR, timeStamp + '/');

        try {
            fs.mkdirSync(modelOutFolder, { recursive: true });
            await model.save(fileSystem(modelOutFolder));

            const metaOutPath = path.resolve(modelOutFolder, 'model_metadata.json');
            const metadataStr = JSON.stringify(this.TRAINING_LABELS);
            fs.writeFileSync(metaOutPath, metadataStr, { encoding: 'utf8' });

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