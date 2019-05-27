import setuptools

setuptools.setup(
    name='jupyterlab_black',
    version='0.2.1',
    packages=setuptools.find_packages(),
    description=(
        'The server extension for jupyterlab_black, '
        'to apply the black formatter to codecell content.'
    ),
    url='https://github.com/ryantam626/jupyterlab_black',
    author='Ryan Tam',
    author_email='ryantam626@gmail.com',
    license = 'MIT',
    install_requires=[
        'notebook'
    ],
)
