import setuptools

setuptools.setup(
    name='jupyterlab_black',
    version='0.1.5',
    packages=setuptools.find_packages(),
    install_requires=[
        'notebook'
    ],
    package_data={'jupyterlab_black': ['*']},
)
