import { Router } from 'express';
import type { Request, Response } from 'express';

import { logText } from '../../helpers/logger.ts';
const router = Router({ mergeParams: true });
import errors from '../../helpers/errors.ts';
import { prisma } from '../../prisma.ts';
import { OAuthService } from '../services/oauthService.ts';
import { UploadService } from '../services/uploadService.ts';

router.get('/', async (req: Request, res: Response) => {
  const account = req.account!!;

  const apps = await prisma.application.findMany({
    where: { owner_id: account.id },
    include: { bot: true }
  });

  return res.json(apps.map(OAuthService.formatApplication)); //move to the service
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const name = req.body.name;
    const account = req.account!!;

    if (!name) {
      return res.status(400).json({
        code: 400,
        name: 'This field is required',
      });
    }

    if (name.length < 2 || name.length > 30) {
      return res.status(400).json({
        code: 400,
        name: 'Must be between 2 and 30 characters.',
      });
    }

    const application = await OAuthService.createApplication(account.id, name);

    return res.status(200).json(application);
  } catch (error) {
    logText(error, 'error');

    return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
  }
});

router.get('/:applicationid', async (req: Request, res: Response) => {
  try {
    const account = req.account!!;

    if (!req.application) {
      return res.status(404).json(errors.response_404.UNKNOWN_APPLICATION);
    }

    if (req.application.owner.id != account.id) {
      return res.status(404).json(errors.response_404.UNKNOWN_APPLICATION);
    }

    return res.status(200).json(req.application);
  } catch (error) {
    logText(error, 'error');

    return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
  }
});

router.patch('/:applicationid', async (req: Request, res) => {
  const { application } = req;
  const account = req.account!!;

  if (!application || application.owner_id !== account.id) {
    return res.status(404).json(errors.response_404.UNKNOWN_APPLICATION);
  }

  let icon = application.icon;

  if (req.body.icon === '') {
    icon = null;
  } else if (req.body.icon) {
    icon = UploadService.saveImage('applications_icons', application.id, req.body.icon);
  }

  if (req.body.name) {
    application.name = req.body.name;
  }

  if (req.body.description != undefined) {
    application.description = req.body.description;
  }

  if (application.name.length < 2 || application.name.length > 30) {
    return res.status(400).json({
      code: 400,
      name: 'Must be between 2 and 30 characters.',
    });
  }

  if (application.description.length > 400) {
    return res.status(400).json({
      code: 400,
      description: 'Must be under 400 characters.',
    }); //to-do
  }

  const updatedApp = await prisma.application.update({
    where: { id: application.id },
    data: {
      name: req.body.name || application.name,
      description: req.body.description ?? application.description,
      icon: icon
    }
  });

  if (application.bot && (req.body.bot_public !== undefined || req.body.bot_require_code_grant !== undefined)) {
    await prisma.bot.update({
      where: { id: application.id },
      data: {
        public: req.body.bot_public ?? application.bot_public,
        require_code_grant: req.body.bot_require_code_grant ?? application.bot_require_code_grant
      }
    });
  }

  return res.json(OAuthService.formatApplication({ ...updatedApp, bot: application.bot }));
});

//I don't know if this is even necessary, yolo
router.delete('/:applicationid', async (req: Request, res: Response) => {
  try {
    const account = req.account!!;
    const application = req.application;

    if (!application || application.owner.id != account.id) {
      return res.status(404).json(errors.response_404.UNKNOWN_APPLICATION);
    }

    await OAuthService.deleteApplication(application.id);

    return res.status(204).send(); //going to assume this is just a 204 for now
  } catch (error) {
    logText(error, 'error');

    return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
  }
});

router.post('/:applicationid/bot', async (req: Request, res: Response) => {
  try {
    const account = req.account!!;
    const application = req.application;

    if (!application || application.owner.id != account.id) {
      return res.status(404).json(errors.response_404.UNKNOWN_APPLICATION);
    }

    if (application.bot) {
      return res.status(400).json({
        code: 400,
        message: 'This application has already been turned into a bot',
      });
    }

    let tryCreateBot = await OAuthService.createBot(application);

    return res.status(200).json(tryCreateBot);
  } catch (error) {
    logText(error, 'error');

    return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
  }
});

router.post('/:applicationid/delete', async (req: Request, res: Response) => {
  try {
    const account = req.account!!;
    const application = req.application;

    if (!application || application.owner.id != account.id) {
      return res.status(404).json(errors.response_404.UNKNOWN_APPLICATION);
    }

    await OAuthService.deleteApplication(application.id);

    return res.status(204).send(); //going to assume this is just a 204 for now
  } catch (error) {
    logText(error, 'error');

    return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
  }
});

export default router;
