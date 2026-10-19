import { defineMessages } from '../../../i18n';

export const buildCacheDiagnosticsMessages = defineMessages({
  en: {
    heading: 'Build and cache',
    applicationBuild: 'Application build',
    workerBuild: 'Worker build',
    cacheEntries: 'Cache entries',
    connection: 'Connection',
    reading: 'Reading',
    notControlling: 'Not controlling',
    offline: 'Offline',
    online: 'Online',

    noteUnsupported:
      'Service workers are unavailable in this browser. Network loading remains active.',
    noteInactive:
      'The service worker is inactive in this session. This is expected during normal local development.',
    noteMismatch:
      'The page and worker builds differ. Activate the waiting build, or reload after the update completes.',
    noteReady: 'A newer build is ready to activate.',
    cacheGroups: 'Cache groups ({count})',

    refreshStatus: 'Refresh status',
    checkForUpdate: 'Check for update',
    clearThisCache: 'Clear this cache',
    activateUpdate: 'Activate update',

    statusReading: 'Reading build and cache status.',
    statusCurrent: 'Build and cache status is current.',
    statusChecking: 'Looking for a newer build.',
    statusUpToDate: 'Up to date.',
    statusNoWorker: 'No service worker registered.',
    statusClearing: 'Clearing cached assets.',
    statusCleared: 'Cache cleared.',
    statusClearFailed: 'Could not clear the cache.',
    statusActivating: 'Activating the waiting build.',
    statusActivateFailed: 'The waiting build could not be activated.',
    statusRefreshing: 'Refreshing build and cache status.',
    statusWaiting: 'A newer build is waiting.',
  },
  'pt-BR': {
    heading: 'Versão e cache',
    applicationBuild: 'Versão do aplicativo',
    workerBuild: 'Versão do service worker',
    cacheEntries: 'Entradas no cache',
    connection: 'Conexão',
    reading: 'Lendo',
    notControlling: 'Sem controle da página',
    offline: 'Offline',
    online: 'Online',

    noteUnsupported:
      'Service workers não estão disponíveis neste navegador. O carregamento pela rede continua ativo.',
    noteInactive:
      'O service worker está inativo nesta sessão. Isso é esperado durante o desenvolvimento local normal.',
    noteMismatch:
      'As versões da página e do service worker são diferentes. Ative a versão em espera ou recarregue depois que a atualização terminar.',
    noteReady: 'Uma versão mais recente está pronta para ser ativada.',
    cacheGroups: 'Grupos de cache ({count})',

    refreshStatus: 'Atualizar status',
    checkForUpdate: 'Verificar atualização',
    clearThisCache: 'Limpar este cache',
    activateUpdate: 'Ativar atualização',

    statusReading: 'Lendo o status da versão e do cache.',
    statusCurrent: 'O status da versão e do cache está atualizado.',
    statusChecking: 'Procurando uma versão mais recente.',
    statusUpToDate: 'Tudo atualizado.',
    statusNoWorker: 'Nenhum service worker registrado.',
    statusClearing: 'Limpando os arquivos em cache.',
    statusCleared: 'Cache limpo.',
    statusClearFailed: 'Não foi possível limpar o cache.',
    statusActivating: 'Ativando a versão em espera.',
    statusActivateFailed: 'Não foi possível ativar a versão em espera.',
    statusRefreshing: 'Atualizando o status da versão e do cache.',
    statusWaiting: 'Há uma versão mais recente em espera.',
  },
});

export type BuildCacheStatusKey =
  | 'statusReading'
  | 'statusCurrent'
  | 'statusChecking'
  | 'statusUpToDate'
  | 'statusNoWorker'
  | 'statusClearing'
  | 'statusCleared'
  | 'statusClearFailed'
  | 'statusActivating'
  | 'statusActivateFailed'
  | 'statusRefreshing'
  | 'statusWaiting';
