const moment = require('moment');
const axios = require('axios').default;

class DocuSign {
  static getConsentUrl(email, userId) {
    const url = new URL(`${config.docusign.url}/oauth/auth`);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('scope', 'signature extended');
    url.searchParams.append('client_id', config.docusign.integrationKey);
    url.searchParams.append('state', userId);
    url.searchParams.append(
      'redirect_uri',
      `${config.domain}/api/v1/auth/docusign/callback`
    );
    url.searchParams.append('login_hint', email);

    return url.href;
  }

  static async docusignOauth(data) {
    const authToken = Buffer.from(
      `${config.docusign.integrationKey}:${config.docusign.secretKey}`
    ).toString('base64');
    const tokenResponse = await axios.post(
      `${config.docusign.url}/oauth/token`,
      data,
      {
        headers: {
          Authorization: `Basic ${authToken}`
        }
      }
    );
    let docusign = tokenResponse.data;

    docusign.expiration = moment()
      .utc()
      .add(docusign.expires_in, 'seconds');

    const userInfoResponse = await axios.get(
      `${config.docusign.url}/oauth/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${docusign.access_token}`
        }
      }
    );

    docusign.userInfo = userInfoResponse.data;
    return docusign;
  }

  static getApiData(docusign) {
    const account = docusign.userInfo.accounts[0];
    return {
      baseUrl: `${account.base_uri}/restapi/v2.1/accounts/${account.account_id}`,
      Authorization: `Bearer ${docusign.access_token}`
    };
  }

  static async getEnvelopes(docusign, envelopeIds) {
    const { baseUrl, Authorization } = DocuSign.getApiData(docusign);
    const url = new URL(`${baseUrl}/envelopes`);
    url.searchParams.append('envelope_ids', envelopeIds);
    url.searchParams.append('status', 'completed,sent,declined,delivered');
    url.searchParams.append('include', 'documents');
    const response = await axios.get(url.href, {
      headers: { Authorization }
    });

    return response.data.envelopes || [];
  }

  static async getEnvelopeDocument(docusign, envelopeId, documentId) {
    const { baseUrl, Authorization } = DocuSign.getApiData(docusign);
    const response = await axios.get(
      `${baseUrl}/envelopes/${envelopeId}/documents/${documentId}`,
      {
        headers: { Authorization },
        responseType: 'arraybuffer'
      }
    );

    return response.data;
  }

  static async createEnvelopeSenderView(docusign, envelopeId) {
    const { baseUrl, Authorization } = DocuSign.getApiData(docusign);
    const response = await axios.post(
      `${baseUrl}/envelopes/${envelopeId}/views/edit`,
      {
        returnUrl: `${config.domain}/api/v1/forms/send/callback`
      },
      {
        headers: { Authorization }
      }
    );

    return response.data;
  }

  static async createEnvelopeRecipientView(
    docusign,
    envelopeId,
    phoneNumber,
    fullName,
    token
  ) {
    const { baseUrl, Authorization } = DocuSign.getApiData(docusign);
    const response = await axios.post(
      `${baseUrl}/envelopes/${envelopeId}/views/recipient`,
      {
        returnUrl: `${config.domain}/api/v1/forms/recipient/callback?envelopeId=${envelopeId}&token=${token}`,
        clientUserId: phoneNumber,
        userName: fullName || phoneNumber,
        email: ``,
        authenticationMethod: 'None',
        xFrameOptions: 'allow_from',
        xFrameOptionsAllowFromUrl: config.fe.youthApp
      },
      {
        headers: { Authorization }
      }
    );

    return response.data;
  }

  static async createEnvelope(docusign, phoneNumber, fullName, forms) {
    const { baseUrl, Authorization } = DocuSign.getApiData(docusign);
    const response = await axios.post(
      `${baseUrl}/envelopes`,
      {
        documents: forms.map((f, i) => {
          return {
            documentBase64: `${f.file.toString('base64')}`,
            documentId: (i + 1).toString(),
            fileExtension: 'pdf',
            name: f.name,
            transformPdfFields: true
          };
        }),
        emailSubject: 'Please sign',
        envelopeIdStamping: true,
        messageLock: true,
        recipientsLock: true,
        status: 'created',
        recipients: {
          signers: [
            {
              name: fullName || phoneNumber,
              clientUserId: phoneNumber,
              email: ``,
              roleName: 'signer',
              recipientId: '1'
            }
          ]
        }
      },
      {
        headers: { Authorization }
      }
    );
    return response.data.envelopeId;
  }
}

module.exports = DocuSign;
