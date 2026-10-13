import unittest,io,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from document_ingestion import extract_document
from app import assess

class TestDocumentIngestion(unittest.TestCase):
 def test_text(self):
  d=extract_document('resume.txt',b'Built Python models\n\nUsed SQL')
  self.assertEqual(d['source_lines'],2)
  self.assertIn('[Line 3] Used SQL',d['text'])
 def test_pdf(self):
  import fitz
  doc=fitz.open();page=doc.new_page();page.insert_text((72,72),'Built Python models')
  raw=doc.tobytes();doc.close()
  extracted=extract_document('resume.pdf',raw)
  self.assertIn('[Page 1, line 1] Built Python models',extracted['text'])
  report=assess({'resume':extracted['text']},[{'title':'Python intern','employer':'Example','text':'Required Python model development'}])
  self.assertTrue(report[0]['requirements'][0]['evidence'])
 def test_docx(self):
  from docx import Document
  doc=Document();doc.add_paragraph('Used PyTorch for research')
  bio=io.BytesIO();doc.save(bio)
  self.assertIn('[Paragraph 1] Used PyTorch',extract_document('cv.docx',bio.getvalue())['text'])
 def test_rejected(self):
  with self.assertRaises(ValueError):extract_document('bad.exe',b'hello')
  with self.assertRaises(ValueError):extract_document('bad.pdf',b'not a pdf')
  with self.assertRaises(ValueError):extract_document('empty.md',b'')
if __name__=='__main__':unittest.main()
