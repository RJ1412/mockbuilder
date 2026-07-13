import glob

out = '<html><body>'
for f in glob.glob('out_test/*.png'):
    if "full" not in f:
        out += f'<hr><h3>{f}</h3><img src="{f}" style="border: 1px solid red; max-width: 100%;">'
out += '</body></html>'
with open('viewer.html', 'w') as f:
    f.write(out)
