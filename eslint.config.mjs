import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'next-env.d.ts'] },

  ...nextCoreWebVitals,
  ...nextTypescript,

  // Fronteira de módulo (roadmap §3): domínio não conhece UI.
  // Sem isso a regra vira convenção, e convenção não sobrevive a pressa.
  {
    files: ['src/modules/**/*.ts', 'src/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'Domínio não importa React. Mova a lógica para service.ts.' },
            { name: 'react-dom', message: 'Domínio não importa React.' },
            { name: 'next/navigation', message: 'Domínio não importa Next.' },
            { name: 'next/headers', message: 'Domínio não importa Next.' },
            { name: 'next/server', message: 'Domínio não importa Next.' },
          ],
          patterns: [
            { group: ['@/app/*', '../../app/*'], message: 'Domínio nunca importa de app/.' },
          ],
        },
      ],
    },
  },

  // A UI fala com módulos pela superfície pública, nunca com o repo direto.
  {
    files: ['app/**/*.ts', 'app/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/*/repo', '@/modules/*/schema', '@/modules/*/ai/*'],
              message: 'Importe pelo index.ts do módulo — repo/schema são internos.',
            },
          ],
        },
      ],
    },
  },
]

export default config
