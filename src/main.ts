import hapi, { Plugin } from '@hapi/hapi';
import inert from '@hapi/inert';
import yar from '@hapi/yar';
import { TwoFactorAuthPlugin } from './plugin/2fa.plugin';
import path from 'path';
import fs from 'fs/promises';
import { Boom } from '@hapi/boom';
import env from './utils/env';


const server = hapi.server({
  port: env.APP_PORT,
});

const YAR_OPTIONS = {
  storeBlank: false,
  cookieOptions: {
    password: process.env.YAR_SECRET,
    isSecure: true
  }
};

const init = async () => {
  await server.register(inert);
  await server.register({
    plugin: yar as Plugin<unknown>,
    options: YAR_OPTIONS
  });
  await server.register({
    plugin: TwoFactorAuthPlugin,
    options: ({
      secret: env.TWO_FA_SECRET,
      label: env.TWO_FA_LABEL,
      issuer: env.TWO_FA_ISSUER,
    })
  });

  server.auth.strategy('simple', '2fa');

  server.auth.default('simple');

  const directory = path.join(__dirname, env.APP_PUBLIC_DIR);

  await fs.mkdir(directory, { recursive: true });

  server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
      directory: {
        path: directory,
        listing: true,
        etagMethod: 'simple',
        lookupCompressed: true,
        redirectToSlash: true,
        showHidden: false,
      },
    },
  });

  await server.start();
  console.log('Server running on %s', server.info.uri);
};

server.ext('onPreResponse', (request, h) => {
  const response = request.response;
  if ((response as Boom).isBoom) {
    const { syscall, code } = response as unknown as { syscall: string, code: string };
    if (syscall === 'scandir' && code === 'ENOENT') {
      return h.response({
        message: `Empty directory`,
      })
    }
  }

  return h.continue;
});



process.on('unhandledRejection', (err) => {
  console.log(err);
  process.exit(1);
});

init();
