---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Swarm.Yachts"
  text: "The Ultimate Guide to Docker Swarm"
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: Stacks
      link: /stacks/
  image: {light: /artwork/yacht-light-mode.svg, dark: /artwork/yacht-dark-mode.svg }

features:
  - title: Administration
    icon: <svg fill="var(--vp-c-text-1)" width="30px" viewBox="0 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M28 9h-1.958v-2.938l-4.042-0.062 0.021 3h-12.146l0.083-3-3.958 0.062v3l-2-0.062c-1.104 0-2 0.896-2 2v14c0 1.104 0.896 2 2 2h24c1.104 0 2-0.896 2-2v-14c0-1.104-0.896-2-2-2zM23 7h2v4h-2v-4zM10 13.812c1.208 0 2.188 1.287 2.188 2.875s-0.98 2.875-2.188 2.875-2.188-1.287-2.188-2.875 0.98-2.875 2.188-2.875zM7 7h2v4h-2v-4zM5.667 22.948c0 0 0.237-1.902 0.776-2.261s2.090-0.598 2.090-0.598 1.006 1.075 1.434 1.075c0.427 0 1.433-1.075 1.433-1.075s1.552 0.238 2.091 0.598c0.633 0.422 0.791 2.261 0.791 2.261h-8.615zM26 22h-9v-1h9v1zM26 20h-9v-1h9v1zM26 18h-9v-1h9v1zM26 16h-9v-1h9v1z"></path></svg>
    details: Simplify the provisioning and management of servers spread across a datacenter or around the world.
  - title: Security
    icon: <svg fill="var(--vp-c-text-1)" width="30px" viewBox="0 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M16 31c-5.247 0-9.5-4.254-9.5-9.5 0-3.41 1.802-6.391 4.5-8.067v-5.933c0-3.038 2.463-5.5 5.5-5.5s5.5 2.462 5.5 5.5v6.637c2.135 1.742 3.5 4.392 3.5 7.363 0 5.246-4.253 9.5-9.5 9.5zM20 7.5c0-1.933-1.566-3.5-3.5-3.5-1.933 0-3.5 1.567-3.5 3.5v4.991c0.944-0.314 1.95-0.491 3-0.491 1.432 0 2.783 0.325 4 0.892v-5.392zM16 13.5c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zM16 29c-4.143 0-7.5-3.357-7.5-7.5s3.357-7.5 7.5-7.5c4.143 0 7.5 3.357 7.5 7.5s-3.357 7.5-7.5 7.5zM17.5 19.5c0-0.828-0.672-1.5-1.5-1.5s-1.5 0.672-1.5 1.5c0 0.711 0.504 1.277 1.167 1.434l-1.167 4.566h3.062l-1.314-4.551c0.705-0.121 1.252-0.709 1.252-1.449z"></path></svg>
    details: Harden an entire infrastructure with scalable solutions implementing the industry's best security practices.
  - title: Monitoring
    icon: <svg fill="var(--vp-c-text-1)" width="30px" viewBox="0 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M3.987 4h-0.987v24h26v-0.963l-24.996-0.050-0.017-22.987zM17 5c0-0.553-0.448-1-1-1h-3c-0.553 0-1 0.447-1 1v20h5v-20zM11 11c0-0.552-0.448-1-1-1h-3c-0.553 0-1 0.448-1 1v14h5v-14zM23 17c0-0.553-0.448-1-1-1h-3c-0.553 0-1 0.447-1 1v8h5v-8zM28 22h-3c-0.553 0-1 0.447-1 1v2h5v-2c0-0.553-0.448-1-1-1z"></path></svg>
    details: Track and monitor metrics across all nodes with powerful open source utilities.

---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, var(--vp-c-brand-2) 30%, var(--vp-c-brand-1));

  --vp-button-brand-bg: var(--vp-c-brand-2);
  --vp-button-brand-hover-bg: var(--vp-c-brand-1);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, var(--vp-c-brand-2) 50%, var(--vp-c-brand-1) 50%);
  --vp-home-hero-image-filter: blur(44px);
}

@media (min-width: 640px) {
  :root {
    --vp-home-hero-image-filter: blur(56px);
  }
}

@media (min-width: 960px) {
  :root {
    --vp-home-hero-image-filter: blur(68px);
  }
}
</style>
