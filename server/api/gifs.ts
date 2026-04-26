import { Router } from 'express';
import type { Request, Response } from 'express';
import { logText } from '../helpers/logger.ts';
import { response_500 } from '../helpers/errors.ts';
import { cacheForMiddleware } from '../helpers/middlewares.ts';
import ctx from '../context.ts';

const router = Router({ mergeParams: true });

interface KlipyMedia {
  url: string;
  dims: [number, number];
  size: number;
}

interface KlipyResult {
  id: string;
  itemurl: string;
  media_formats: {
    tinygif: KlipyMedia;
    gif: KlipyMedia;
    tinymp4: KlipyMedia;
  };
}

interface KlipyCategory {
  searchterm: string;
  image: string;
}

router.get('/trending', cacheForMiddleware(60 * 5, "private", true), async (_req: Request, res: Response) => {
  try {
    if (!ctx.config?.klipy_api_key) {
      return res.status(200).json({ categories: [], gifs: [] });
    }

    const catRes = await fetch(
      `https://api.klipy.com/v2/categories?key=${ctx.config?.klipy_api_key}&type=featured`,
    );
    const catData = await catRes.json() as { tags: KlipyCategory[] };

    const trendRes = await fetch(
      `https://api.klipy.com/v2/featured?key=${ctx.config?.klipy_api_key}&limit=10&media_filter=tinygif`,
    );
    const trendData = await trendRes.json() as { results: KlipyResult[] };

    const categories = (catData.tags || []).map((tag: KlipyCategory) => ({
      name: tag.searchterm,
      src: tag.image,
      label: tag.searchterm,
    }));

    const gifs = (trendData.results || []).map((gif) => ({
      type: 'gif',
      id: gif.id,
      src: `/proxy/${encodeURIComponent(gif.media_formats.tinygif.url)}`,
      url: gif.itemurl,
      width: gif.media_formats.tinygif.dims[0],
      height: gif.media_formats.tinygif.dims[1],
    }));

    return res.json({
      categories: categories,
      gifs: gifs,
    });
  } catch (error) {
    logText(error, 'error');
    return res.status(500).json(response_500.INTERNAL_SERVER_ERROR);
  }
});

router.get('/trending-gifs', cacheForMiddleware(60 * 5, "private", true), async (_req: Request, res: Response) => {
  try {
     if (!ctx.config?.klipy_api_key) {
      return res.status(200).json([]);
    }

    const response = await fetch(
      `https://api.klipy.com/v2/featured?key=${ctx.config?.klipy_api_key}&limit=50&media_filter=tinymp4,gif`,
    );
    const data = await response.json() as { results: KlipyResult[] };

    const gifs = (data.results || []).map((gif) => {
      const video = gif.media_formats.tinymp4;

      return {
        type: 'gif',
        id: gif.id,
        src: video.url,
        url: gif.itemurl,
        width: video.dims[0],
        height: video.dims[1],
        format: 'VIDEO',
      };
    });

    return res.json(gifs);
  } catch (err) {
    logText(err, 'error');
    return res.status(500).json(response_500.INTERNAL_SERVER_ERROR);
  }
});

router.get('/search', cacheForMiddleware(60 * 5, "private", true), async (req: Request, res: Response) => {
  try {
    if (!ctx.config?.klipy_api_key) {
      return res.status(200).json([]);
    }

    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const media_format = (req.query.media_format as string) ?? "gif";
    const mediaFilter = media_format.includes('mp4') ? 'tinymp4,gif' : 'tinygif,gif';

    const params = new URLSearchParams({
      q: query,
      key: ctx.config!.klipy_api_key,
      limit: limit.toString(),
      media_filter: mediaFilter,
      contentfilter: 'medium',
    });

    const response = await fetch(`https://api.klipy.com/v2/search?${params}`);
    const data = await response.json() as { results: KlipyResult[] };

    const gifs = (data.results || []).map((gif) => {
      const isMp4Req = media_format?.includes('mp4');
      const media = isMp4Req ? gif.media_formats.tinymp4 : gif.media_formats.tinygif;

      return {
        type: 'gif',
        id: gif.id,
        src: `/proxy/${encodeURIComponent(media.url)}`,
        url: gif.itemurl,
        width: media.dims[0],
        height: media.dims[1],
        format: isMp4Req ? 'VIDEO' : 'GIF',
      };
    });

    return res.json(gifs);
  } catch (err) {
    logText(err, 'error');
    return res.status(500).json(response_500.INTERNAL_SERVER_ERROR);
  }
});

export default router;