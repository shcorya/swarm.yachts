import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "dockerswarm.net",
  description: "The Ultimate Guide to Docker Swarm",
  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],
  themeConfig: {
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
          text: 'Guide',
          items: [
            { text: 'RedisRaft', link: '/stacks/redisraft/', items:[
              {text: "Compose", link: '/stacks/redisraft/#compose'}
            ]},
            { text: 'etcd', link: '/stacks/etcd/', items:[
              {text: "Compose", link: '/stacks/etcd/#compose'}
            ]},
          ]
        }
      ],

      // This sidebar gets displayed when a user
      // is on `config` directory.
      '/getting-started/': [
        {
          text: 'Config',
          items: [
            { text: 'Blah', link: '/config/' },
            { text: 'Blah', link: '/config/three' },
            { text: 'Blah', link: '/config/four' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ],

    search: {
      provider: 'local'
    }
  }
})
