import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const linkSchema = z.object({
  href: z.string(),
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});

const posts = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.string(),
    readTime: z.string(),
    seoDescription: z.string(),
    links: z.array(linkSchema).default([]),
  }),
});

export const collections = { posts };
