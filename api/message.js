<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta http-equiv="Content-Style-Type" content="text/css">
  <title></title>
  <meta name="Generator" content="Cocoa HTML Writer">
  <meta name="CocoaVersion" content="2487.5">
  <style type="text/css">
    p.p1 {margin: 0.0px 0.0px 0.0px 0.0px; font: 12.0px Helvetica}
    p.p2 {margin: 0.0px 0.0px 0.0px 0.0px; font: 12.0px Helvetica; min-height: 14.0px}
  </style>
</head>
<body>
<p class="p1">import OpenAI from "openai";</p>
<p class="p2"><br></p>
<p class="p1">const client = new OpenAI({</p>
<p class="p1"><span class="Apple-converted-space">  </span>apiKey: process.env.OPENAI_API_KEY,</p>
<p class="p1">});</p>
<p class="p2"><br></p>
<p class="p1">export default async function handler(req, res) {</p>
<p class="p1"><span class="Apple-converted-space">  </span>const id = req.query.id || "TEST";</p>
<p class="p1"><span class="Apple-converted-space">  </span>const prompt = `Message pour l'objet ${id}. Écris une phrase douce.`;</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>try {</p>
<p class="p1"><span class="Apple-converted-space">    </span>const response = await client.responses.create({</p>
<p class="p1"><span class="Apple-converted-space">      </span>model: "gpt-4.1-mini",</p>
<p class="p1"><span class="Apple-converted-space">      </span>input: prompt</p>
<p class="p1"><span class="Apple-converted-space">    </span>});</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>const output = response.output?.[0]?.content?.[0]?.text || "Je suis là.";</p>
<p class="p1"><span class="Apple-converted-space">    </span>res.status(200).json({ text: output.trim() });</p>
<p class="p1"><span class="Apple-converted-space">  </span>} catch (e) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>res.status(500).json({ error: "Erreur IA" });</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
</body>
</html>
