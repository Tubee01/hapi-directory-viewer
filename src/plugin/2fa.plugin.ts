import Hapi from '@hapi/hapi';
import speakeasy, { OtpauthURLOptions } from 'speakeasy';
import qrCode from 'qrcode';

export type TwoFactorAuthPluginOptions = {
    oauth: OtpauthURLOptions
    cookie?: {
        name: string
    }
    redirect: string
}

function verifyToken(options: OtpauthURLOptions, token: string) {
    return speakeasy.totp.verify({ ...options, token })
}

function getCookieToken(request: Hapi.Request, name: string) {
    return request.yar.get(name);
}

function setCookieToken(request: Hapi.Request, name: string, token: string) {
    request.yar.set(name, token);
}

const httpUnAuthorizedHtmlResponse = (verifyEndpoint: string, h: Hapi.ResponseToolkit<Hapi.ReqRefDefaults>) => h.response(`<form method="POST" action="${verifyEndpoint}">
<input type="text" name="token" placeholder="Enter 2FA token">
<button type="submit">Submit</button>
</form>`
).type('text/html').takeover().code(401);

const twoFactorAuthSchema = (options: Pick<TwoFactorAuthPluginOptions, 'oauth' | 'cookie'>, verifyEndpoint: string) => () => {
    return {
        authenticate: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
            const verified = getCookieToken(request, options.cookie?.name || '2fa-verified');
            if (verified) {
                return h.authenticated({
                    credentials: verified,
                });
            }

            if (request.path === verifyEndpoint) {
                return h.continue;
            }

            return httpUnAuthorizedHtmlResponse(verifyEndpoint, h);
        },
    }
}



const routes = (options: TwoFactorAuthPluginOptions): Record<string, Hapi.ServerRoute> => ([
    {
        method: 'GET',
        path: `/2fa/qr-code`,
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
            const otpauth_url = speakeasy.otpauthURL(options.oauth);

            const qrCodeUrl = await qrCode.toDataURL(otpauth_url);

            return h.response(`<img src="${qrCodeUrl}">`).type('text/html');
        }

    },
    {
        method: ['POST', 'GET'],
        path: `/2fa/verify`,
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
            if (request.auth.isAuthenticated) {
                return h.redirect(options.redirect);
            }

            const params = request.query;
            const payload = request.payload;

            let token: string | null = null;

            if (typeof params.token === 'string') {
                token = params.token;
            } else if (typeof payload === 'object' && payload !== null && 'token' in payload) {
                token = payload.token as string;
            }

            if (token) {
                const verified = verifyToken(options.oauth, token);

                if (verified) {
                    const cookieName = options.cookie?.name || '2fa-verified';
                    setCookieToken(request, cookieName, verified.toString());
                    console.debug(`2FA verified for ${request.info.remoteAddress}, redirecting to ${options.redirect}`);

                    return h.redirect(options.redirect);
                }
            }

            return httpUnAuthorizedHtmlResponse(request.path, h);

        }
    },
]).reduce((acc, route) => {
    acc[route.path] = route;
    return acc;
}, {} as Record<string, Hapi.ServerRoute>);


export const TwoFactorAuthPlugin: Hapi.Plugin<TwoFactorAuthPluginOptions> = ({
    name: 'TwoFactorAuthPlugin',
    requirements: {
        hapi: '>=20.0.0',
    },
    dependencies: [
        '@hapi/yar',
    ],
    register: async function (server: Hapi.Server, options: TwoFactorAuthPluginOptions) {
        const prefix = server.realm.modifiers.route.prefix;
        const hapiRoutes = routes(options);
        server.route(Object.values(hapiRoutes));

        server.auth.scheme('2fa', twoFactorAuthSchema(options, [prefix, '2fa/verify'].filter(Boolean).join('/')));
    },
});