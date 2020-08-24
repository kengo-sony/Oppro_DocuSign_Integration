const httpStatus = require('http-status');
const moment = require('moment');
const DocuSign = require('../lib/docusign');

class AuthController {
  static async docusignAuth(req, res, next) {
    try {
      const url = DocuSign.getConsentUrl(req.user.email, req.user.id);
      if (!req.user.docusign) {
        return res.status(httpStatus.IM_A_TEAPOT).json({
          message: 'Please perform DocuSign login',
          url
        });
      } else {
        const isValid = moment()
          .utc()
          .add(1, 'hour')
          .isBefore(req.user.docusign.expiration);

        if (isValid) {
          return next();
        }
        let docusign;
        try {
          docusign = await DocuSign.docusignOauth({
            grant_type: 'refresh_token',
            refresh_token: req.user.docusign.refresh_token
          });
        } catch (e) {
          return res.status(httpStatus.IM_A_TEAPOT).json({
            message: 'Please perform DocuSign login',
            url
          });
        }
        return next();
      }
    } catch (e) {
      next(e);
    }
  }

  static docusignAuthOk(req, res) {
    return res.status(httpStatus.OK).end();
  }
}

module.exports = AuthController;
