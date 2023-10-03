import Joi from "joi";
import { config } from 'dotenv';
import path from "path";

config();

export interface Environment extends Pick<NodeJS.ProcessEnv, 'NODE_ENV' | 'TZ'> {
    APP_PORT: number;
    APP_DOMAIN?: string;
    YAR_SECRET: string;
    TWO_FA_SECRET: string;
    TWO_FA_LABEL: string;
    TWO_FA_ISSUER: string;
    APP_PUBLIC_DIR: string;
    APP_ROUTE_PREFIX?: string;
    AUTH_REDIRECT_URL?: string;
}

const joiSchema = Joi.object<Environment>({
    NODE_ENV: Joi.string().default('development'),
    TZ: Joi.string().default('UTC'),
    APP_PORT: Joi.number().default(3000),
    APP_DOMAIN: Joi.string(),
    YAR_SECRET: Joi.string().required(),
    TWO_FA_SECRET: Joi.string().required(),
    TWO_FA_LABEL: Joi.string().required(),
    TWO_FA_ISSUER: Joi.string().required(),
    APP_PUBLIC_DIR: Joi.string().default(path.join(process.cwd(), 'public')),
    APP_ROUTE_PREFIX: Joi.string(),
    AUTH_REDIRECT_URL: Joi.string(),
}).options({
    allowUnknown: true,
    convert: true,
    stripUnknown: true,
});


const env = joiSchema.validate(process.env, {
    convert: true,
});

if (env.error) {
    throw env.error;
}

export default env.value;