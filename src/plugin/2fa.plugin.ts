import Hapi from '@hapi/hapi';
import speakeasy, { OtpauthURLOptions } from 'speakeasy';
import qrCode from 'qrcode';

export const TwoFactorAuthPlugin = ({
    name: 'TwoFactorAuthPlugin',
    requirements: {
        hapi: '>=20.0.0',
    },
    dependencies: [
        '@hapi/yar'
    ],
    register: async function (server: Hapi.Server, options: OtpauthURLOptions) {
        server.route({
            method: 'GET',
            path: '/2fa-qr',
            handler: async (request, h) => {
                const otpauth_url = speakeasy.otpauthURL({
                    ...options,
                });

                const qrCodeUrl = await qrCode.toDataURL(otpauth_url);

                return h.response(`<img src="${qrCodeUrl}">`).type('text/html');
            }
        });

        server.route({
            method: ['POST', 'GET'],
            path: '/2fa-verify',
            handler: async (request, h) => {
                const params = request.query;
                const payload = request.payload;

                let token: string | null = null;

                if (typeof params.token === 'string') {
                    token = params.token;
                } else if (typeof payload === 'object' && payload !== null && 'token' in payload) {
                    token = payload.token as string;
                }

                if (token) {
                    const verified = speakeasy.totp.verify({
                        ...options,
                        token,
                    });

                    if (verified) {
                        request.yar.set('2fa-verified', verified);
                    }
                }

                return h.redirect('/');
            }
        });

        server.auth.scheme('2fa', () => {
            return {
                authenticate: async (request, h) => {
                    if (request.path === '/2fa-verify') {
                        if (request.method === 'get') {
                            const params = request.query;
                            if (typeof params.token === 'string') {

                                const verify = speakeasy.totp.verify({
                                    ...options,
                                    token: params.token,
                                });

                                if (verify) {
                                    request.yar.set('2fa-verified', verify);
                                    return h.authenticated({
                                        credentials: verify as any,
                                    });
                                }
                            }
                        }
                        if (request.method === 'post') {
                            return h.continue;
                        }
                    }
                    const verified = request.yar.get('2fa-verified');

                    if (verified) {
                        return h.authenticated({
                            credentials: verified,
                        });
                    }

                    return h.response(`
                        <form method="POST" action="/2fa-verify">
                            <input type="text" name="token" placeholder="Enter 2FA token">
                            <button type="submit">Submit</button>
                        </form>
                    `).takeover().code(401);
                }
            }
        });


    },
});