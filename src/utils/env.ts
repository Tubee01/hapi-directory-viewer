import Joi from "joi";
import { config } from 'dotenv';

config();

export interface Environment extends NodeJS.ProcessEnv {
    APP_PORT: string;
    APP_DOMAIN: string;
    YAR_SECRET: string;
    TWO_FA_SECRET: string;
    TWO_FA_LABEL: string;
    TWO_FA_ISSUER: string;
    APP_PUBLIC_DIR: string;
}

const joiSchema = Joi.object<Environment>({
    APP_PORT: Joi.number().default(3000),
    APP_DOMAIN: Joi.string().default('localhost'),
    YAR_SECRET: Joi.string().required(),
    TWO_FA_SECRET: Joi.string().required(),
    TWO_FA_LABEL: Joi.string().required(),
    TWO_FA_ISSUER: Joi.string().required(),
    APP_PUBLIC_DIR: Joi.string().default('public'),
}).options({
    allowUnknown: true,
});


const env = joiSchema.validate(process.env, {
    convert: true,
});

if (env.error) {
    throw env.error;
}

export default env.value;