import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Swarm.Yachts",
  description: "The Ultimate Guide to Docker Swarm",
  head: [
    [
      'link', { rel: 'icon', href: '/favicon.ico' }
    ],
    [
      'script', {},
      `var _paq = window._paq = window._paq || [];
      /* tracker methods like "setCustomDimension" should be called before "trackPageView" */
      _paq.push(['trackPageView']);
      _paq.push(['enableLinkTracking']);
      (function() {
      var u="//matomo.corya.net/";
      _paq.push(['setTrackerUrl', u+'matomo.php']);
      _paq.push(['setSiteId', '2']);
      var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
      g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
      })();`
    ]
  ],
  lastUpdated: true,
  themeConfig: {
    logo: '/logo.svg',
    editLink: {
      pattern: 'https://github.com/shcorya/swarm.yachts/edit/master/:path'
    },
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started/' },
      { text: 'Stacks', link: '/stacks/' },
      { text: 'Appendix', link: '/resources/' },
    ],

    sidebar: {
      // This sidebar gets displayed when a user
      // is on `stacks` directory.
      '/stacks/': [
        {
          text: 'Stacks',
          items: [
            { text: 'Management', link: '/stacks/management/', items:[
            ]},
            { text: 'cron', link: '/stacks/cron/', items:[
            ]},
            { text: 'System', link: '/stacks/system/', items:[
            ]},
            { text: 'Certbot', link: '/stacks/certbot/', items:[
            ]},
            { text: 'RedisRaft', link: '/stacks/redisraft/', items:[
              // {text: "Compose", link: '/stacks/redisraft/#compose'}
            ]},
            { text: 'MongoDB', link: '/stacks/mongodb/', items:[
              // {text: "Compose", link: '/stacks/redisraft/#compose'}
            ]},
            { text: 'Caddy', link: '/stacks/caddy/', items:[
            ]},
            { text: 'MariaDB', link: '/stacks/mariadb/', items:[
            ]},
            { text: 'etcd', link: '/stacks/etcd/', items:[
            ]},
            { text: 'Patroni', link: '/stacks/patroni/', items:[
            ]},
            { text: 'Garage', link: '/stacks/garage/', items:[
            ]},
            { text: 'OpenSearch', link: '/stacks/opensearch/', items:[
            ]},
            { text: 'Logstash', link: '/stacks/logstash/', items:[
            ]},
            { text: 'cAdvisor', link: '/stacks/cadvisor/', items:[
            ]},
          ]
        },
      ],

      // This sidebar gets displayed when a user
      // is on `config` directory.
      '/getting-started/': [
        // {
        //   text: 'Getting Started',
        //   items: [
        //     { text: 'Provisioning', link: '/getting-started/#provisioning' },
        //     { text: 'Installation', link: '/getting-started/#installation' },
        //   ]
        // }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/shcorya/swarm.yachts' }
    ],

    search: {
      provider: 'local'
    },

    footer: {
      message: 'A compilation of resources maintained by <a href=https://scorya.com>Stephen Corya</a> | Created with <a href=https://vitepress.dev>VitePress</a>',
      copyright: 'Copyright ©2024-present Stephen Corya'
    },

    srcExclude: ['**/README.md']
  }
})
