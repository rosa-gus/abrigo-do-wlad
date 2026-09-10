# Abrigo do Wlad — Plataforma Web

Repositório oficial da plataforma digital do Abrigo do Wlad, projeto social
independente na cidade de São Paulo, dedicado ao cuidado e à adoção
responsável de animais. A plataforma reúne a divulgação dos cães, o recebimento
de candidaturas de adoção, as campanhas de arrecadação, os pontos parceiros de
reciclagem e a gestão das atividades do abrigo.

O projeto nasceu para substituir as antigas listagens de animais em PDF, que
dificultavam a atualização e a divulgação das adoções. O catálogo digital tornou
esse processo mais acessível, organizado e sustentável, além de oferecer à
equipe do abrigo uma área própria para manter as informações publicadas.

A primeira versão foi desenvolvida como projeto acadêmico de extensão da
UNINTER, com o objetivo de ampliar a visibilidade e a eficiência das ações
sociais do abrigo.

## Funcionalidades

- 🐶 **Vitrine de adoção:** catálogo atualizado e filtrável dos animais
  disponíveis, com destaque rotativo na página inicial.
- 📝 **Solicitação de adoção:** formulário em múltiplas etapas para avaliação de
  possíveis tutores, com proteção dos dados sensíveis e controle do ciclo das
  candidaturas.
- ♻️ **Reciclagem solidária:** divulgação dos pontos de coleta parceiros que
  contribuem com as arrecadações do abrigo.
- 🤝 **Campanhas e apoio:** apresentação das formas de contribuição e das ações
  mantidas pelo projeto social.
- 🛠️ **Painel administrativo:** gestão de animais, pontos de reciclagem,
  candidaturas e imagens por usuários autorizados.
- 🗑️ **Retenção de dados:** rotina automática para remoção de candidaturas
  expiradas, em conformidade com a política de privacidade e a LGPD.
- 🌓 **Acessibilidade e usabilidade:** tema claro e escuro, integração com
  VLibras, animações e interface responsiva.

## Monorepo

As aplicações pública e administrativa compartilham componentes visuais e
serviços de domínio, mas preservam builds, configurações e publicações
independentes.

```text
apps/
├── public/       # Site público
└── admin/        # Painel administrativo
packages/
└── ui/           # Componentes compartilhados
workers/
├── app/          # API da aplicação pública
├── cron/         # Tarefas agendadas
└── shared/       # Serviços compartilhados pelos Workers
```

## Infraestrutura

Nesta implantação, a escolha de infraestrutura foi Cloudflare para entrega e
execução das aplicações e Google/Firebase para os serviços de dados. A
arquitetura não depende exclusivamente desses provedores e pode ser implementada
com uma infraestrutura equivalente.

## Tecnologias

- React, TypeScript e Vite
- CSS Modules, Motion e Lucide React
- Cloudflare Workers, Static Assets, Cron Triggers, Access e KV
- Google Cloud Firestore e Firebase Web SDK
- Cloudinary

## Identidade visual

O tema visual foi apelidado de **Jaci** (do tupi _Îasy_ e do guarani _Jasy_),
em referência à [deusa da Lua](https://pt.wikipedia.org/wiki/Jaci). Suas cores remetem à Terra, com tons inspirados no
céu, na água, no solo e na vegetação, somando-se à identidade já existente do
Abrigo do Wlad. A paleta e os estilos globais do site estão em
[`apps/public/src/index.css`](apps/public/src/index.css).

## Desenvolvimento

O projeto requer Node.js 22.12 ou superior.

```bash
npm install
cp .env.example .env
npm run dev
```

Comandos principais:

| Objetivo                 | Comando                 |
| ------------------------ | ----------------------- |
| Site público             | `npm run dev:public`    |
| Painel administrativo    | `npm run dev:admin`     |
| Build completo           | `npm run build`         |
| Testes                   | `npm test`              |
| Verificação de qualidade | `npm run lint`          |
| Atualizar diagramas      | `npm run docs:diagrams` |

## Documentação técnica

- [Aplicação pública](apps/public/README.md)
- [Painel administrativo](apps/admin/README.md)
- [Publicação segura do Access e regras do Firestore](docs/security/access-and-rules-rollout.md)
- [Diagrama da arquitetura](docs/architecture.svg)
- [Diagrama da arquitetura do painel administrativo](docs/admin-architecture.svg)

## Autores

Desenvolvido e mantido por **[Alan Climaco](https://github.com/AlanClimaco)** e
**[Luis Gustavo R.C](https://github.com/rosa-gus)**.

## Licença

Este projeto é de propriedade exclusiva do Abrigo do Wlad. O código-fonte está
disponível para fins de estudo e manutenção, mas a utilização comercial ou a
réplica da identidade visual sem autorização prévia é vedada. Todos os direitos
reservados, exceto pelo pacote [Jaci UI](packages/ui), disponibilizado sob a
[Licença MIT](packages/ui/LICENSE.txt), com autoria de Luis Gustavo R.C. e Alan
Climaco.
