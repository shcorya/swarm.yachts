import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Swarm.Yachts",
  description: "The Ultimate Guide to Docker Swarm",
  head: [
    [
      'link', { rel: 'icon', href: '/artwork/favicon.ico' }
    ]
  ],
  lastUpdated: true,
  themeConfig: {
    logo: '/artwork/logo.svg',
    editLink: {
      pattern: 'https://github.com/shcorya/swarm.yachts/edit/master/:path'
    },
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started/' },
      { text: 'Stacks', link: '/stacks/' },
      { text: 'Other Resources', link: '/resources/' },
    ],

    sidebar: {
      // This sidebar gets displayed when a user
      // is on `guide` directory.
      '/stacks/': [
        {
          text: 'Stacks',
          items: [
            { text: 'RedisRaft', link: '/stacks/redisraft/', items:[
              // {text: "Compose", link: '/stacks/redisraft/#compose'}
            ]},
            { text: 'Caddy', link: '/stacks/caddy/', items:[
            ]},
            { text: 'etcd', link: '/stacks/etcd/', items:[
            ]},
            { text: 'Patroni', link: '/stacks/patroni/', items:[
            ]},
            { text: 'Garage', link: '/stacks/garage/', items:[
            ]},
          ]
        }
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
      message: 'A compilation of resources maintained by <a href=https://corya.me>Steve Corya</a> | Released under the CC0 1.0 Universal License | Created with <a href=https://vitepress.dev>VitePress</a>'
    }
  }
})
