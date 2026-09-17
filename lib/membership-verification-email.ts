/** Self-contained email markup: inline styles and tables also work in Outlook. */
export function membershipVerificationEmail(code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("A six-digit verification code is required.");

  return {
    subject: "Your membership verification code",
    text: `York City & District Society of Model Engineers\n\nVerify your email address\n\nYour membership verification code is ${code}.\n\nEnter this code on the membership application page to continue. It expires in 10 minutes and can only be used once.\n\nKeep this code private. The Society will never ask you to tell us your code.\n\nIf you did not request this email, you can safely ignore it.`,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your membership verification code</title></head>
<body style="margin:0;padding:0;background-color:#eee9dc;color:#18382d;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">Your six-digit code is ready. Enter it on your membership application within 10 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eee9dc"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:30px 28px;background-color:#18382d;border-top:5px solid #d5a84b">
<p style="margin:0 0 10px;color:#d5a84b;font-size:12px;line-height:18px;letter-spacing:2px;font-weight:bold">YORK MODEL ENGINEERS</p>
<p style="margin:0;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:36px">Your membership starts here.</p>
</td></tr>
<tr><td style="padding:32px 28px;background-color:#fffdf7">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:bold;color:#18382d">Verify your email address</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#39443e">Enter this code on the membership application page to continue.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:22px 12px;background-color:#f1eee4;border:1px solid #d8cfb8;border-radius:6px">
<p style="margin:0 0 8px;font-size:11px;line-height:18px;letter-spacing:2px;font-weight:bold;color:#526258">YOUR VERIFICATION CODE</p>
<p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:36px;line-height:46px;letter-spacing:6px;font-weight:bold;color:#18382d">${code}</p>
</td></tr></table>
<p style="margin:18px 0 26px;text-align:center;font-size:14px;line-height:22px;color:#526258">Valid for <strong>10 minutes</strong> &middot; Use once</p>
<p style="margin:0;padding-top:22px;border-top:1px solid #e5dfd0;font-size:14px;line-height:23px;color:#39443e"><strong>Keep your code private.</strong><br>The Society will never ask you to tell us your code.</p>
<p style="margin:16px 0 0;font-size:13px;line-height:22px;color:#526258">If you did not request this email, you can safely ignore it.</p>
</td></tr>
<tr><td align="center" style="padding:22px 12px"><p style="margin:0;font-size:12px;line-height:20px;color:#526258">York City &amp; District Society of Model Engineers<br>Membership applications</p></td></tr>
</table></td></tr></table>
</body></html>`,
  };
}
