const path = require('node:path');
const fs = require('node:fs');
const { handleApiRequest } = require('./routes/api');
const { sendJson, sendError } = require('./utils/http');
const { handleAdminApiRequest, createAdminSessions } = require('./routes/admin');
const {
  createPortalSessions,
  getPortalAccount,
  handleAuthRequest,
  handlePortalRequest,
} = require('./routes/portal');

const AUTH_EXEMPT_PAGES = new Set([
  '/index.html',
  '/login.html',
  '/member-register.html',
  '/terms.html',
  '/admin.html',
  '/admin-users.html',
]);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function createApplication(database, publicRoot, options = {}) {
  const suppliedRoot = path.resolve(publicRoot);
  const nestedPublicRoot = path.join(suppliedRoot, 'public');
  const staticRoot = fs.existsSync(nestedPublicRoot) ? nestedPublicRoot : suppliedRoot;
  const adminSessions = options.adminSessions || createAdminSessions();
  const portalSessions = options.portalSessions || createPortalSessions();
  return async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/admin/')) {
        await handleAdminApiRequest(
          request,
          response,
          database,
          url,
          adminSessions,
          options.adminCredentials || {},
        );
        return;
      }
      if (url.pathname.startsWith('/api/auth/')) {
        await handleAuthRequest(request, response, database, url, portalSessions);
        return;
      }
      if (url.pathname.startsWith('/api/leader/') || url.pathname.startsWith('/api/member/')) {
        await handlePortalRequest(request, response, database, url, portalSessions);
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        await handleApiRequest(request, response, database, url, async (incomingRequest) => {
          const account = await getPortalAccount(incomingRequest, portalSessions, database);
          return account?.role === 'member' ? account : null;
        });
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
      }

      let requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      if (requestedPath === '/signup.html') requestedPath = '/member-register.html';
      const filePath = path.resolve(staticRoot, `.${requestedPath}`);
      const relativePath = path.relative(staticRoot, filePath);
      const pathParts = relativePath.split(path.sep);
      const inPublicAssetFolder = ['css', 'images', 'images2', 'js'].includes(pathParts[0]);
      const isRootPage = pathParts.length === 1 && /\.html$/i.test(filePath);
      const isAllowedAsset =
        inPublicAssetFolder && MIME_TYPES[path.extname(filePath)] !== undefined;
      if (
        relativePath.startsWith('..') ||
        path.isAbsolute(relativePath) ||
        pathParts.some((part) => part.startsWith('.')) ||
        (!isRootPage && !isAllowedAsset)
      ) {
        sendError(response, 404, 'Page not found.');
        return;
      }
      if (request.method === 'GET' && ['/leader.html', '/member.html'].includes(requestedPath)) {
        const account = await getPortalAccount(request, portalSessions, database);
        const expectedRole = requestedPath === '/leader.html' ? 'leader' : 'member';
        if (account && account.role !== expectedRole) {
          const destination =
            account.role === 'member'
              ? '/member.html'
              : account.role === 'leader'
                ? '/leader.html'
                : '/login.html';
          response.writeHead(302, { Location: destination, 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
      }
      if (
        request.method === 'GET' &&
        path.extname(filePath).toLowerCase() === '.html' &&
        !AUTH_EXEMPT_PAGES.has(requestedPath) &&
        !(await getPortalAccount(request, portalSessions, database))
      ) {
        response.writeHead(302, {
          Location: `/login.html?next=${encodeURIComponent(`${requestedPath}${url.search}`)}`,
          'Cache-Control': 'no-store',
        });
        response.end();
        return;
      }
      const content = fs.readFileSync(filePath);
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        sendError(response, 404, 'Page not found.');
        return;
      }
      console.error(error);
      sendError(response, 500, 'An unexpected server error occurred.');
    }
  };
}

module.exports = { createApplication };
