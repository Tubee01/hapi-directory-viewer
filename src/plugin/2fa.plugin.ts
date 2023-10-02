import Hapi from '@hapi/hapi';
import speakeasy, { OtpauthURLOptions } from 'speakeasy';
import qrCode from 'qrcode';

export type TwoFactorAuthPluginOptions = {
    oauth: OtpauthURLOptions
    routes?: {
        prefix: string;
    }
    cookie?: {
        name: string
    }
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

function removeTrailingSlash(str: string) {
    return str.replace(/\/$/, "");
}

export const TwoFactorAuthPlugin = ({
    name: 'TwoFactorAuthPlugin',
    requirements: {
        hapi: '>=20.0.0',
    },
    dependencies: [
        '@hapi/yar',
    ],
    register: async function (server: Hapi.Server, options: TwoFactorAuthPluginOptions) {
        const { oauth: oauthOptions, routes: route = { prefix: server.settings.uri ? new URL(server.settings.uri).pathname : '' }, cookie: cookieOptions = { name: '2fa-verified' } } = options;

        const prefix = removeTrailingSlash(route.prefix);

        const routes = {
            DEFAULT: server.settings.uri ? new URL(server.settings.uri).pathname : '/',
            QR_CODE: `${prefix}/qr-code`,
            VERIFY: `${prefix}/verify`,
        }

        const httpUnAuthorizedHtmlResponse = (request: Hapi.Request, h: Hapi.ResponseToolkit<Hapi.ReqRefDefaults>) => h.response(`<form method="POST" action="${[request.server.settings.uri, 'verify'].filter(Boolean).join('/')}">
            <input type="text" name="token" placeholder="Enter 2FA token">
            <button type="submit">Submit</button>
        </form>`
        ).type('text/html').takeover().code(401);

        server.route({
            method: 'GET',
            path: routes.QR_CODE,
            vhost: server.settings.host,
            handler: async (request, h) => {
                const otpauth_url = speakeasy.otpauthURL(oauthOptions);

                const qrCodeUrl = await qrCode.toDataURL(otpauth_url);

                return h.response(`<img src="${qrCodeUrl}">`).type('text/html');
            }
        });

        server.route({
            method: ['POST', 'GET'],
            path: routes.VERIFY,
            handler: async (request, h) => {
                if (request.auth.isAuthenticated) {
                    return h.redirect(routes.DEFAULT);
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
                    const verified = verifyToken(oauthOptions, token);

                    if (verified) {
                        setCookieToken(request, cookieOptions.name, verified.toString());
                        console.debug(`2FA verified for ${request.info.remoteAddress}, redirecting to ${routes.DEFAULT}`);

                        return h.redirect(routes.DEFAULT);
                    }
                }

                return httpUnAuthorizedHtmlResponse(request, h);
            }
        });

        server.auth.scheme('2fa', () => {
            return {
                authenticate: async (request, h) => {
                    const verified = getCookieToken(request, cookieOptions.name);
                    if (verified) {
                        return h.authenticated({
                            credentials: verified,
                        });
                    }

                    if (request.path === routes.VERIFY) {
                        if (request.method === 'get') {
                            const params = request.query;
                            if (typeof params.token === 'string') {
                                const { token } = params;

                                const verified = verifyToken(oauthOptions, token);

                                if (verified) {
                                    setCookieToken(request, cookieOptions.name, verified.toString());
                                    h.authenticated({
                                        credentials: verified as any,
                                    });

                                    return h.redirect(routes.DEFAULT);
                                }
                            }
                        }
                        if (request.method === 'post') {
                            return h.continue;
                        }
                    }

                    return httpUnAuthorizedHtmlResponse(request, h);
                }
            }
        });
    },
});